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
import pino from 'pino';

const sleep = promisify(setTimeout);
const logger = pino();

@injectable()
export class DownloadManager {
    constructor(private _mqService: RabbitMQService,
                private _downloadService: DownloadService,
                private _fileManageService: FileManageService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
    }

    public async start(): Promise<void> {
        await this._mqService.initPublisher(DOWNLOAD_MESSAGE_EXCHANGE, 'direct');
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

    /**
     * There are two types of message from video manager:
     * 1. video doesn't have a rule, simply copy the video file to root folder
     * 2. video manager processed video file. download the file from the video manager to download location.
     * @param msg
     * @private
     */
    private async onVideoManagerMessage(msg: VideoManagerMessage): Promise<void> {
        const savePath = join(this._configManager.defaultDownloadLocation(), msg.bangumiId);
        let videoFileDestPath: string;
        if (msg.isProcessed) {
            logger.info({message: 'video processed', video_id: msg.videoId, filename: msg.processedFile});
            // download from video manager
            const filename = FileManageService.processFilename(basename(msg.processedFile.filename));
            videoFileDestPath = join(savePath, filename);
            await this._fileManageService.download(msg.processedFile, videoFileDestPath, msg.jobExecutorId);
        } else {
            logger.info({message: 'not processed', video_id: msg.videoId});
            videoFileDestPath = await this._downloadService.copyVideoFile(msg.downloadTaskId, savePath);
        }
        // all work is done at download manager side.
        // TODO: deprecate this after Albireo is deprecated
        await this.callAlbireoRpc(msg, videoFileDestPath);
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

    private async callAlbireoRpc(msg: VideoManagerMessage, videoFileDestPath: string): Promise<void> {
        const rpcUrl = this._configManager.albireoRPCUrl();
        // save relative path, relative to bangumi folder
        videoFileDestPath = videoFileDestPath.substring(videoFileDestPath.indexOf(msg.bangumiId) + msg.bangumiId.length + 1, videoFileDestPath.length);
        await axios.get(`${rpcUrl}/download_complete`, {
            params: {
                video_id: msg.videoId,
                bangumi_id: msg.bangumiId,
                file_path: encodeURIComponent(videoFileDestPath)
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            }
        });
    }

}