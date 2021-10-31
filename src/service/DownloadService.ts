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
import { DatabaseService } from './DatabaseService';
import { DOWNLOAD_MESSAGE_EXCHANGE, TYPES } from '../TYPES';
import { DownloadAdapter } from '../download-adapter/DownloadAdapter';
import { filter, mergeMap } from 'rxjs/operators';
import { JobStatus } from '../domain/JobStatus';
import { RabbitMQService } from './RabbitMQService';
import { DownloadJob } from '../entity/DownloadJob';
import { DownloadMQMessage } from '../domain/DownloadMQMessage';
import { v4 as uuid4 } from 'uuid';
import { RemoteFile } from '../domain/RemoteFile';
import { basename, join, dirname } from 'path';
import { TorrentFile } from '../domain/TorrentFile';
import { ConfigManager } from '../utils/ConfigManager';
import { DownloaderType } from '../domain/DownloaderType';
import { copyFile, mkdir } from 'fs/promises';
import { FileManageService } from './FileManageService';

@injectable()
export class DownloadService {
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.Downloader) private _downloader: DownloadAdapter,
                private _mqService: RabbitMQService) {
    }

    public async start(): Promise<void> {
        await this._downloader.connect(true);

        this._downloader.downloadStatusChanged()
            .pipe(
                filter(jobId => !!jobId),
                mergeMap((jobId) => {
                    return this._databaseService.getJobRepository().findOne({id: jobId});
                }),
                filter(job => {
                    return job && job.status === JobStatus.Complete;
                })
            )
            .subscribe((job) => {
                this.downloadComplete(job).then(() => {
                    console.log('download complete');
                });
            });

        this._downloader.torrentDeleteEvent()
            .pipe(
                filter(jobId => !!jobId)
            )
            .subscribe((jobId) => {
                console.log(jobId + ' delete id');
            });
    }

    public async download(job: DownloadJob): Promise<void> {
        const downloader = this._configManager.downloader() as DownloaderType;
        switch(downloader) {
            case DownloaderType.qBittorrent:
                job.downloader = DownloaderType.qBittorrent;
                break;
            case DownloaderType.Deluge:
                job.downloader = DownloaderType.Deluge;
                break;
        }
        const downloadLocation = join(this._configManager.defaultDownloadLocation(), job.bangumiId);
        job.torrentId = await this._downloader.download(job.torrentUrl, downloadLocation);
        console.log('download hash: ' + job.torrentId);
        await this._databaseService.getJobRepository().save(job);
        console.log('downloadJob id: ' + job.id);
    }

    /**
     * Copy video file from torrent save path to destination path.
     * return the copied video file path
     * @param jobId
     * @param destPath
     */
    public async copyVideoFile(jobId: string, destPath: string): Promise<string> {
        const job = await this._databaseService.getJobRepository().findOne({id: jobId});
        if (job) {
            const torrentInfo = await this._downloader.getTorrentInfo(job.torrentId);
            const torrentFiles = await this._downloader.getTorrentContent(job.torrentId);
            const videoFile = DownloadService.findVideoFile(torrentFiles);
            const sourcePath = join(torrentInfo.save_path, videoFile.name);
            const videoFileDestPath = join(destPath, FileManageService.processFilename(videoFile.name));
            try {
                const destDir = dirname(videoFileDestPath);
                await mkdir(destDir, {recursive: true});
                await copyFile(sourcePath, videoFileDestPath);
            } catch (ex) {
                console.warn(ex);
            }
            return videoFileDestPath;
        }
    }

    private async downloadComplete(job: DownloadJob): Promise<void> {
        const files = await this._downloader.getTorrentContent(job.torrentId);
        const info = await this._downloader.getTorrentInfo(job.torrentId);
        const savePath = info.save_path;
        const remoteFiles = files
            .map(f => {
                const rf = new RemoteFile();
                rf.filename = basename(f.name);
                rf.fileLocalPath = join(savePath, f.name);
                rf.fileUri = this._configManager.getFileUrl(f.name, job.id);
                return rf;
            });
        if (job.fileMapping) {
            const messages = job.fileMapping.map((mapping) => {
                const fileIndex = files.findIndex(f => f.name === mapping.filePath);
                const file = remoteFiles[fileIndex];
                const msg = this.newMessage(job);
                msg.videoId = mapping.videoId;
                msg.videoFile = file;
                msg.otherFiles = remoteFiles.filter((f, i) => i !== fileIndex);
                return msg;
            });
            const promises = [];
            for (const message of messages) {
                promises.push(this._mqService.publish(DOWNLOAD_MESSAGE_EXCHANGE, '', message));
            }
            await Promise.all(promises);
        } else {
            // in case of some legacy feed that doesn't provide torrent content. no fileMapping available.
            // we need to guess the video file.
            const videoFile = DownloadService.findVideoFile(files);
            const message = this.newMessage(job);
            message.otherFiles = remoteFiles;
            message.videoFile = new RemoteFile();
            message.videoFile.filename = basename(videoFile.name);
            message.videoFile.fileLocalPath = join(savePath, videoFile.name);
            message.videoFile.fileUri = this._configManager.getFileUrl(videoFile.name, job.id);
            message.otherFiles.splice(message.otherFiles.findIndex(f => f.filename === message.videoFile.filename), 1);
            await this._mqService.publish(DOWNLOAD_MESSAGE_EXCHANGE, '', message);
        }
    }

    private newMessage(job: DownloadJob): DownloadMQMessage {
        const msg = new DownloadMQMessage();
        msg.id = uuid4();
        msg.downloadTaskId = job.id;
        msg.bangumiId = job.bangumiId;
        msg.appliedProcessRuleId = job.appliedProcessRuleId;
        msg.downloadManagerId = this._configManager.applicationId();
        msg.videoId = job.videoId;
        return msg;
    }

    private static findVideoFile(files: TorrentFile[]): TorrentFile {
        let maxSize = 0;
        let maxFileIndex = 0;
        for (let i = 0; i < files.length; i++) {
            if (maxSize < files[i].size) {
                maxSize = files[i].size;
                maxFileIndex = i;
            }
        }
        return files[maxFileIndex];
    }
}