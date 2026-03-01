/*
 * Copyright 2020 IROHA LAB
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
import {
    CORE_TASK_EXCHANGE,
    DOWNLOAD_MESSAGE_EXCHANGE,
    DOWNLOAD_TASK,
    DOWNLOAD_TASK_QUEUE,
    RabbitMQService,
    TYPES,
    VIDEO_MANAGER_EXCHANGE,
    VIDEO_MANAGER_GENERAL,
    VIDEO_MANAGER_QUEUE, VideoManagerMessage
} from '@irohalab/mira-shared';
import { DownloadTaskMessage } from './domain/DownloadTaskMessage';
import { DatabaseService } from './service/DatabaseService';
import { DownloadService } from './service/DownloadService';
import { DownloadJob } from './entity/DownloadJob';
import { basename, join } from 'path';
import { ConfigManager } from './utils/ConfigManager';
import { FileManageService } from './service/FileManageService';
import axios from 'axios';
import { promisify } from 'util';
import { getStdLogger } from './utils/Logger';
import { VideoMetadata } from '@irohalab/mira-shared/domain/VideoMetadata';
import { KEY_DOWNLOAD_MESSAGE } from './TYPES_DM';

const sleep = promisify(setTimeout);
const logger = getStdLogger();
const S3_URL_PATTERN = /^s3:\/\/.+/;

@injectable()
export class DownloadManager {
    constructor(@inject(TYPES.RabbitMQService) private _mqService: RabbitMQService,
                private _downloadService: DownloadService,
                private _fileManageService: FileManageService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
    }

    public async start(): Promise<void> {
        await this._mqService.initPublisher(DOWNLOAD_MESSAGE_EXCHANGE, 'direct', KEY_DOWNLOAD_MESSAGE);
        await this._mqService.initConsumer(VIDEO_MANAGER_EXCHANGE, 'direct', VIDEO_MANAGER_QUEUE, VIDEO_MANAGER_GENERAL);
        await this._mqService.initConsumer(CORE_TASK_EXCHANGE, 'direct', DOWNLOAD_TASK_QUEUE, DOWNLOAD_TASK);

        await this._downloadService.start();

        await this._mqService.consume(VIDEO_MANAGER_QUEUE, async (msg) => {
            try {
                await this.onVideoManagerMessage(msg as VideoManagerMessage);
            } catch (ex) {
                logger.error(ex);
            }
            return true;
        });

        await this._mqService.consume(DOWNLOAD_TASK_QUEUE, async (msg) => {
            try {
                await this.onDownloadTask(msg as DownloadTaskMessage);
            } catch (ex) {
                logger.warn(ex);
                await sleep(3000);
                return false;
            }
            return true;
        });
    }

    public async stop(): Promise<void> {
        // TODO: Clean up
    }

    private async onVideoManagerMessage(msg: VideoManagerMessage): Promise<void> {
        const savePath = join(this._configManager.defaultDownloadLocation(), msg.bangumiId);
        let videoFileDestPathList: string[] = [];
        let isBlobUrl: boolean = false;
        // download from video manager
        for(const processedFile of msg.processedFiles) {
            if (DownloadManager.isS3Url(processedFile.fileUri)) {
                isBlobUrl = true;
                videoFileDestPathList.push(processedFile.fileUri);
            } else {
                const filename = FileManageService.processFilename(basename(processedFile.filename));
                const videoFileDestPath = join(savePath, filename);
                await this._fileManageService.download(processedFile, videoFileDestPath, msg.jobExecutorId);
                videoFileDestPathList.push(videoFileDestPath);
            }
        }
        // download thumbnail and keyframes image
        let metadata = null;
        if (msg.metadata) {
            const keyframeImagePathList: string[] = [];
            let thumbnailPath: string;
            if (isBlobUrl) {
                thumbnailPath = msg.metadata.thumbnailPath.fileUri;
                for (const kfImageRemoteFile of msg.metadata.keyframeImagePathList ) {
                    keyframeImagePathList.push(kfImageRemoteFile.fileUri);
                }
            } else {
                const thumbnailFilename = FileManageService.processFilename(basename(msg.metadata.thumbnailPath.filename));
                thumbnailPath = join(savePath, thumbnailFilename);
                await this._fileManageService.download(msg.metadata.thumbnailPath, thumbnailPath, msg.jobExecutorId);
                for (const kfImageRemoteFile of msg.metadata.keyframeImagePathList ) {
                    const keyframeImageFilename = FileManageService.processFilename(basename(kfImageRemoteFile.filename));
                    const keyframeImagePath = join(savePath, keyframeImageFilename);
                    await this._fileManageService.download(kfImageRemoteFile, keyframeImagePath, msg.jobExecutorId);
                    keyframeImagePathList.push(keyframeImagePath);
                }
            }
            metadata = Object.assign({}, msg.metadata, {thumbnailPath, keyframeImagePathList});
        }
        if (msg.isProcessed) {
            logger.info({message: 'video processed', video_id: msg.videoId, filenames: `[${msg.processedFiles.join(', ')}]`});
        } else {
            logger.info({message: 'not processed', video_id: msg.videoId});
        }
        // all work is done at download manager side.
        // TODO: deprecate this after Albireo is deprecated
        await this.callAlbireoRpc(msg, videoFileDestPathList, metadata, isBlobUrl);
    }

    private async onDownloadTask(msg: DownloadTaskMessage): Promise<void> {
        const job = new DownloadJob();
        job.bangumiId = msg.bangumiId;
        job.torrentUrl = msg.torrentUrl;
        job.videoId = msg.videoId;
        job.fileMapping = msg.fileMapping;
        job.downloadTaskMessage = msg;
        job.downloadTaskMessageId = msg.id;
        job.createTime = new Date();
        await this._downloadService.download(job);
    }

    private async callAlbireoRpc(msg: VideoManagerMessage,
                                 videoFileDestPathList: string[],
                                 metadata: Omit<VideoMetadata, 'thumbnailPath' | 'keyframeImagePathList'> & {thumbnailPath: string, keyframeImagePathList: string[]},
                                 isBlobUrl: boolean): Promise<void> {
        const rpcUrl = this._configManager.albireoRPCUrl();
        let normalizedVideoFileDestPath: string[];
        // save relative path, relative to bangumi folder
        if (!isBlobUrl) {
            normalizedVideoFileDestPath = videoFileDestPathList.map((videoFileDestPath) => {
                return videoFileDestPath.substring(videoFileDestPath.indexOf(msg.bangumiId) + msg.bangumiId.length + 1, videoFileDestPath.length)
            });

            if (metadata && metadata.thumbnailPath) {
                metadata.thumbnailPath = metadata.thumbnailPath.substring(metadata.thumbnailPath.indexOf(msg.bangumiId), metadata.thumbnailPath.length);
            }
            if (metadata && metadata.keyframeImagePathList) {
                metadata.keyframeImagePathList = metadata.keyframeImagePathList.map(p => p.substring(p.indexOf(msg.bangumiId), p.length));
            }
        } else {
            normalizedVideoFileDestPath = videoFileDestPathList;
        }

        await axios.post(`${rpcUrl}/download_complete`, {
            video_id: msg.videoId,
            bangumi_id: msg.bangumiId,
            file_path_list: normalizedVideoFileDestPath,
            metadata: metadata
        });
    }

    private static isS3Url(uri: string): boolean {
        return S3_URL_PATTERN.test(uri);
    }

}