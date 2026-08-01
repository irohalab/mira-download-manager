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
    CreateBucketCommand,
    GetBucketLifecycleConfigurationCommand,
    ListBucketsCommand, PutBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommandInput,
    S3Client, S3ServiceException
} from '@aws-sdk/client-s3';
import { stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { getStdLogger } from '../utils/Logger';
import { Upload } from '@aws-sdk/lib-storage';

export interface S3UploadProgress {
    loaded: number;
    total: number;
}

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
                    if (rule && rule.Expiration) {
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

    public async upload(localFilePath: string, onProgress?: (progress: S3UploadProgress) => void): Promise<string> {
        if (this.configManager.storageType() !== 'S3') {
            return null;
        }
        const bucketName = this.configManager.s3Bucket().name;
        const s3Key = localFilePath;

        try {
            const stats = await stat(localFilePath);
            const fileSizeInBytes = stats.size;
            logger.info(`Starting upload for ${localFilePath} to s3://${bucketName}/${s3Key}`);
            const upload = new Upload({
                client: this.s3Client,
                params: {
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: createReadStream(localFilePath),
                    ContentLength: fileSizeInBytes,
                },
                leavePartsOnError: false
            });
            upload.on('httpUploadProgress', (progress) => {
                onProgress?.({
                    loaded: Math.min(progress.loaded ?? 0, fileSizeInBytes),
                    total: fileSizeInBytes
                });
            });

            await upload.done();
            onProgress?.({loaded: fileSizeInBytes, total: fileSizeInBytes});
            logger.info(`Successfully uploaded ${localFilePath} to s3://${bucketName}/${s3Key}`);
            return `s3://${bucketName}/${s3Key}`;
        } catch (error) {
            console.error(`Upload failed for ${localFilePath}:`, error);
            throw error;
        }
    }
}
