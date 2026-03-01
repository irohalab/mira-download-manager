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
import { KEY_DOWNLOAD_MESSAGE, TYPES_DM } from '../TYPES_DM';
import { DownloadAdapter } from '../download-adapter/DownloadAdapter';
import { filter, mergeMap } from 'rxjs/operators';
import { JobStatus } from '../domain/JobStatus';
import { DownloadJob } from '../entity/DownloadJob';
import { v4 as uuid4 } from 'uuid';
import { basename, dirname, join } from 'path';
import { TorrentFile } from '../domain/TorrentFile';
import { ConfigManager } from '../utils/ConfigManager';
import { DownloaderType } from '../domain/DownloaderType';
import { copyFile, mkdir } from 'fs/promises';
import { FileManageService } from './FileManageService';
import {
    DOWNLOAD_MESSAGE_EXCHANGE,
    DownloadMQMessage,
    RabbitMQService,
    RemoteFile,
    Sentry,
    TYPES,
} from '@irohalab/mira-shared';
import { getStdLogger } from '../utils/Logger';
import { S3Service } from './S3Service';
import { DownloadedObject } from '../entity/DownloadedObject';

const logger = getStdLogger();

@injectable()
export class DownloadService {
    constructor(@inject(TYPES.ConfigManager) private configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private databaseService: DatabaseService,
                @inject(TYPES_DM.Downloader) private downloader: DownloadAdapter,
                @inject(TYPES.Sentry) private sentry: Sentry,
                private s3Service: S3Service,
                @inject(TYPES.RabbitMQService) private mqService: RabbitMQService) {
    }

    public async start(enableEvent: boolean = true): Promise<void> {
        await this.downloader.connect(enableEvent);

        if (enableEvent) {
            this.downloader.downloadStatusChanged()
                .pipe(
                    filter(jobId => !!jobId),
                    mergeMap((jobId: string) => {
                        return this.databaseService.getJobRepository().findOne({id: jobId});
                    }),
                    filter((job: DownloadJob) => {
                        return job && job.status === JobStatus.Complete;
                    }),
                    mergeMap((job: DownloadJob) => {
                        job.endTime = new Date();
                        return this.databaseService.getJobRepository().save(job);
                    })
                )
                .subscribe((job: DownloadJob | undefined) => {
                    this.downloadComplete(job).then(() => {
                        logger.info('download complete');
                    }).catch((error) => {
                        job.status = JobStatus.Error;
                        job.errorInfo = {
                            message: error.message,
                            stack: error.stack
                        };
                        logger.error(error);
                    });
                });

            this.downloader.torrentDeleteEvent()
                .pipe(
                    filter(jobId => !!jobId)
                )
                .subscribe((jobId: string) => {
                    logger.info(jobId + ' delete id');
                });
        }
    }

    public async download(job: DownloadJob): Promise<void> {
        const downloader = this.configManager.downloader() as DownloaderType;
        switch(downloader) {
            case DownloaderType.qBittorrent:
                job.downloader = DownloaderType.qBittorrent;
                break;
            case DownloaderType.Deluge:
                job.downloader = DownloaderType.Deluge;
                break;
        }
        const downloadLocation = join(this.configManager.defaultDownloadLocation(), job.bangumiId);
        try {
            job.torrentId = await this.downloader.download(job.torrentUrl, downloadLocation);
        } catch (e) {
            job.errorInfo = {
                message: e.message,
                stack: e.stack
            };
            job.status = JobStatus.Error;
        }
        logger.debug('download hash: ' + job.torrentId);
        await this.databaseService.getJobRepository().save(job);
        logger.debug('downloadJob id: ' + job.id);
    }

    public async pause(job: DownloadJob, saveJob = false): Promise<void> {
        await this.downloader.pause(job.torrentId);
        job.status = JobStatus.Paused;
        if (saveJob) {
            await this.databaseService.getJobRepository().save(job);
        }
    }

    public async resume(job: DownloadJob, saveJob = false): Promise<void> {
        await this.downloader.resume(job.torrentId);
        job.status = JobStatus.Pending;
        if (saveJob) {
            await this.databaseService.getJobRepository().save(job);
        }
    }

    public async delete(job: DownloadJob, saveJob = false): Promise<void> {
        await this.downloader.remove(job.torrentId, true);
        job.status = JobStatus.Removed;
        if (saveJob) {
            await this.databaseService.getJobRepository().save(job);
        }
    }

    public async getTorrentContent(torrentId: string): Promise<TorrentFile[]> {
        return await this.downloader.getTorrentContent(torrentId);
    }

    /**
     * Copy video file from torrent save path to destination path.
     * return the copied video file path
     * @param jobId
     * @param videoId
     * @param destPath
     */
    public async copyVideoFile(jobId: string, videoId: string, destPath: string): Promise<string> {
        const job = await this.databaseService.getJobRepository().findOne({id: jobId});
        if (job) {
            const torrentInfo = await this.downloader.getTorrentInfo(job.torrentId);
            const torrentFiles = await this.downloader.getTorrentContent(job.torrentId);
            let videoFile: TorrentFile;
            if (job.fileMapping) {
                const mapping = job.fileMapping.find(m => m.videoId === videoId);
                if (mapping) {
                    videoFile = torrentFiles.find(f => f.name === mapping.filePath);
                }
            }
            if (!videoFile) {
                videoFile = DownloadService.findVideoFile(torrentFiles);
            }
            const sourcePath = join(torrentInfo.save_path, videoFile.name);
            const videoFileDestPath = join(destPath, FileManageService.processFilename(videoFile.name));
            try {
                const destDir = dirname(videoFileDestPath);
                await mkdir(destDir, {recursive: true});
                await copyFile(sourcePath, videoFileDestPath);
            } catch (ex) {
                this.sentry.capture(ex);
                logger.warn(ex);
            }
            return videoFileDestPath;
        }
    }

    public async downloadComplete(job: DownloadJob): Promise<void> {
        const files = await this.downloader.getTorrentContent(job.torrentId);
        const info = await this.downloader.getTorrentInfo(job.torrentId);
        const savePath = info.save_path;
        const remoteFiles = files
            .map(f => {
                const rf = new RemoteFile();
                rf.filename = basename(f.name);
                rf.fileLocalPath = join(savePath, f.name);
                rf.fileUri = this.configManager.getFileUrl(f.name, job.id);
                return rf;
            });


        if (this.configManager.storageType() === 'S3') {
            const dlObjRepo = this.databaseService.getDownloadedObjectRepository();
            const expireInDays = this.configManager.s3Bucket().expireInDays;
            const downloadedObjects = await job.downloadedObjects.load();
            const newlyUploadedObjects: DownloadedObject[] = [];
            for (const remoteFile of remoteFiles) {
                if (downloadedObjects.length > 0) {
                    const obj = downloadedObjects.find(obj => obj.localPath === remoteFile.fileLocalPath);
                    if (obj) {
                        remoteFile.fileUri = obj.s3Uri;
                        logger.info(`${remoteFile.fileUri} was found for file ${remoteFile.fileLocalPath}, use it directly`);
                        continue;
                    }
                }
                remoteFile.fileUri = await this.s3Service.upload(remoteFile.fileLocalPath);
                const obj = new DownloadedObject();
                obj.s3Uri = remoteFile.fileUri;
                obj.expiration = new Date(Date.now() + expireInDays * 24 * 3600);
                obj.name = remoteFile.filename;
                obj.downloadJob = job;
                newlyUploadedObjects.push(obj);
                logger.info(`uploaded ${remoteFile.fileUri}`);
            }
            if (newlyUploadedObjects.length > 0) {
                await dlObjRepo.save(newlyUploadedObjects);
            }
        }

        if (job.fileMapping) {
            const messages = job.fileMapping.map((mapping) => {
                const fileIndex = files.findIndex(f => f.name === mapping.filePath);
                const file = remoteFiles[fileIndex];
                const msg = this.newMessage(job);
                msg.videoId = mapping.videoId;
                msg.videoFile = file;
                msg.fileMapping = mapping;
                msg.otherFiles = remoteFiles.filter((f, i) => {
                    return job.fileMapping.every(mp => mp.filePath !== files[i].name);
                });
                return msg;
            });
            const promises = [];
            for (const message of messages) {
                promises.push(this.mqService.publish(DOWNLOAD_MESSAGE_EXCHANGE, KEY_DOWNLOAD_MESSAGE, message));
            }
            await Promise.all(promises);
            console.log('all message sent');
        } else {
            // in case of some legacy feed that doesn't provide torrent content. no fileMapping available.
            // we need to guess the video file.
            const videoFile = DownloadService.findVideoFile(files);
            const message = this.newMessage(job);
            message.otherFiles = remoteFiles;
            message.videoFile = new RemoteFile();
            message.videoFile.filename = basename(videoFile.name);
            message.videoFile.fileLocalPath = join(savePath, videoFile.name);
            message.videoFile.fileUri = this.configManager.getFileUrl(videoFile.name, job.id);
            message.otherFiles.splice(message.otherFiles.findIndex(f => f.filename === message.videoFile.filename), 1);
            await this.mqService.publish(DOWNLOAD_MESSAGE_EXCHANGE, KEY_DOWNLOAD_MESSAGE, message);
            console.log('message sent');
        }
    }

    private newMessage(job: DownloadJob): DownloadMQMessage {
        const msg = new DownloadMQMessage();
        msg.id = uuid4();
        msg.downloadTaskId = job.id;
        msg.bangumiId = job.bangumiId;
        msg.downloadManagerId = this.configManager.applicationId();
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