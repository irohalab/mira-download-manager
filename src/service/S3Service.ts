/*
 * Copyright 2025 IROHA LAB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { ConfigManager } from '../utils/ConfigManager';
import {
    AbortMultipartUploadCommand,
    CompletedPart, CompleteMultipartUploadCommand,
    CreateBucketCommand,
    CreateMultipartUploadCommand, GetBucketLifecycleConfigurationCommand,
    ListBucketsCommand, PutBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommandInput,
    PutObjectCommand,
    S3Client, S3ServiceException, UploadPartCommand
} from '@aws-sdk/client-s3';
import { stat } from 'fs/promises';
import { basename } from 'path';
import { createReadStream } from 'fs';
import { getStdLogger } from '../utils/Logger';

const FIVE_GIGABYTES = 5 * 1024 * 1024 * 1024;
const MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (AWS recommends parts between 5MB and 5GB)

const logger = getStdLogger();

const S3_RULE_ID = 'DownloadedFileExpireRule';

@injectable()
export class S3Service {
    private s3Client: S3Client;

    constructor(@inject(TYPES.ConfigManager) private configManager: ConfigManager) {
        if (configManager.storageType() === 'S3') {
            this.s3Client = new S3Client(configManager.s3Config());
        }
    }

    public async ensureBucket(): Promise<void> {
        if (this.configManager.storageType() !== 'S3') {
            return null;
        }
        const bucketConfig = this.configManager.s3Bucket();

        const lifecycleConfiguration: PutBucketLifecycleConfigurationCommandInput = {
            Bucket: bucketConfig.name,
            LifecycleConfiguration: {
                Rules: [
                    {
                        ID: S3_RULE_ID,
                        // The filter determines which objects the rule applies to.
                        // An empty prefix means the rule applies to all objects in the bucket.
                        Filter: {
                            Prefix: '',
                        },

                        // The status must be 'Enabled' for the rule to take effect.
                        Status: 'Enabled',

                        // This section defines the expiration action.
                        Expiration: {
                            // Specifies that objects will expire 3 days after their creation date.
                            Days: bucketConfig.expireInDays,
                        },
                    }
                ]
            }
        }

        const result = await this.s3Client.send(new ListBucketsCommand());
        if (!result.Buckets.some(bucket => bucket.Name === bucketConfig.name)) {
            // create a non versioning bucket
            await this.s3Client.send(new CreateBucketCommand({Bucket: bucketConfig.name}));
            await this.s3Client.send(new PutBucketLifecycleConfigurationCommand(lifecycleConfiguration));
        } else {
            try {
                const response = await this.s3Client.send(new GetBucketLifecycleConfigurationCommand({Bucket: bucketConfig.name}));
                const rule = response.Rules.find(rule => rule.ID === S3_RULE_ID);
                if (!rule || !rule.Expiration || rule.Expiration.Days !== bucketConfig.expireInDays) {
                    logger.info('Lifecycle configuration mismatch');
                    if (rule.Expiration) {
                        logger.info(`Current bucket expire days is ${rule.Expiration.Days} days, but the app config is ${bucketConfig.expireInDays} days`);
                    }
                    logger.info(`Replace with new configuration, expireInDays is ${bucketConfig.expireInDays} days`);
                    await this.s3Client.send(new PutBucketLifecycleConfigurationCommand(lifecycleConfiguration));
                }
            } catch (error) {
                if (error instanceof S3ServiceException) {
                    if (error.$metadata.httpStatusCode === 404) {
                        console.log(error);
                        logger.info(`No configuration found, Put new configuration, expireInDays is ${bucketConfig.expireInDays} days`);
                        await this.s3Client.send(new PutBucketLifecycleConfigurationCommand(lifecycleConfiguration));
                        return;
                    }
                }
                throw error;
            }
        }
    }

    public async upload(localFilePath: string): Promise<string> {
        if (this.configManager.storageType() !== 'S3') {
            return null;
        }
        const bucketName = this.configManager.s3Bucket().name;
        const s3Key = basename(localFilePath);

        try {
            const stats = await stat(localFilePath);
            const fileSizeInBytes = stats.size;

            if (fileSizeInBytes <= FIVE_GIGABYTES) {
                // For files 5GB or smaller, use PutObjectCommand
                logger.info(`Starting standard upload for ${localFilePath} to s3://${bucketName}/${s3Key}`);
                const fileStream = createReadStream(localFilePath);
                const putObjectCommand = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: fileStream,
                    ContentLength: fileSizeInBytes, // Important for progress tracking and some S3 features
                });

                await this.s3Client.send(putObjectCommand);
                logger.info(`Successfully uploaded ${localFilePath} to s3://${bucketName}/${s3Key}`);
                return `s3://${bucketName}/${s3Key}`;
            } else {
                // For files larger than 5GB, use multipart upload
                logger.info(`Starting multipart upload for ${localFilePath} to s3://${bucketName}/${s3Key}`);

                const createMultipartUploadCommand = new CreateMultipartUploadCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                });
                const { UploadId } = await this.s3Client.send(createMultipartUploadCommand);

                if (!UploadId) {
                    throw new Error("Failed to create multipart upload.");
                }

                logger.info(`Multipart upload initiated. Upload ID: ${UploadId}`);

                const completedParts: CompletedPart[] = [];
                const fileStream = createReadStream(localFilePath, { highWaterMark: MULTIPART_CHUNK_SIZE });
                let partNumber = 1;
                let accumulatedBytes = 0;

                try {
                    for await (const chunk of fileStream) {
                        const uploadPartCommand = new UploadPartCommand({
                            Bucket: bucketName,
                            Key: s3Key,
                            UploadId,
                            PartNumber: partNumber,
                            Body: chunk,
                            ContentLength: chunk.length,
                        });

                        const { ETag } = await this.s3Client.send(uploadPartCommand);
                        if (!ETag) {
                            throw new Error(`Failed to upload part ${partNumber}. ETag is missing.`);
                        }

                        completedParts.push({ PartNumber: partNumber, ETag });
                        accumulatedBytes += chunk.length;
                        logger.info(`Uploaded part ${partNumber} (${(accumulatedBytes / fileSizeInBytes * 100).toFixed(2)}%)`);
                        partNumber++;
                    }

                    const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
                        Bucket: bucketName,
                        Key: s3Key,
                        UploadId,
                        MultipartUpload: {
                            Parts: completedParts,
                        },
                    });

                    await this.s3Client.send(completeMultipartUploadCommand);
                    logger.info(`Successfully completed multipart upload for ${localFilePath} to s3://${bucketName}/${s3Key}`);
                    return `s3://${bucketName}/${s3Key}`;

                } catch (uploadError) {
                    console.error("Error during multipart upload. Aborting...", uploadError);
                    const abortMultipartUploadCommand = new AbortMultipartUploadCommand({
                        Bucket: bucketName,
                        Key: s3Key,
                        UploadId,
                    });
                    await this.s3Client.send(abortMultipartUploadCommand);
                    logger.info("Multipart upload aborted.");
                    throw uploadError; // Re-throw the error after aborting
                }
            }
        } catch (error) {
            console.error(`Upload failed for ${localFilePath}:`, error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }
}