/*
 * Copyright 2021 IROHA LAB
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

import { Response as ExpressResponse } from 'express';
import {
    controller,
    httpDelete,
    httpGet,
    interfaces,
    queryParam,
    requestParam,
    response
} from 'inversify-express-utils';
import { inject } from 'inversify';
import { TYPES_DM } from '../../TYPES_DM';
import { ConfigManager } from '../../utils/ConfigManager';
import { join, basename } from 'path';
import { stat } from 'fs/promises';
import { DatabaseService } from '../../service/DatabaseService';
import { DownloadAdapter } from '../../download-adapter/DownloadAdapter';
import { QBittorrentDownloadAdapter } from '../../download-adapter/QBittorrentDownloadAdapter';
import pino from 'pino';
import { capture } from '../../utils/sentry';
import { TYPES } from '@irohalab/mira-shared';

const logger = pino();

@controller('/file')
export class FileController implements interfaces.Controller {
    // private readonly _videoTempPath: string;
    private readonly _message404 = 'file not found';
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _database: DatabaseService,
                @inject(TYPES_DM.Downloader) private _downloader: DownloadAdapter) {
        // this._videoTempPath = this._configManager.videoFileTempDir();
    }

    @httpGet('/content/:downloadJobId')
    public async downloadContent(@requestParam('downloadJobId') downloadJobId: string,
                         @queryParam('relativeFilePath') relativeFilePath: string,
                         @response() res: ExpressResponse): Promise<void> {
        logger.debug((<QBittorrentDownloadAdapter> this._downloader)._cookie);
        const job = await this._database.getJobRepository().findOne({id: downloadJobId});
        if (job) {
            const torrentId = job.torrentId;
            const torrentInfo = await this._downloader.getTorrentInfo(torrentId);
            const savePath = torrentInfo.save_path;
            const fileLocalPath = join(savePath, relativeFilePath);
            const filename = basename(relativeFilePath);
            try {
                logger.debug(filename);
                const fsStatObj = await stat(fileLocalPath);
                if (!fsStatObj.isFile()) {
                    // try to address issue
                    capture({ fileLocalPath, fsStatObj, message: 'path is not a file' });
                    res.status(404).json({'message': this._message404});
                    return;
                }
                logger.debug('fileLocalPath', fileLocalPath);
                await new Promise<void>((resolve, reject) => {
                    res.download(fileLocalPath, filename, (err) => {
                        if (err) {
                            capture(err);
                            logger.error('error when sending downloaded file' + err);
                            reject(err);
                        } else {
                            logger.info('Sent:', filename);
                            resolve();
                        }
                    });
                });
            } catch (e) {
                if (e.code === 'ENOENT') {
                    capture(e);
                    res.status(404).json({'message': this._message404});
                } else {
                    capture(e);
                    logger.error(e);
                    res.status(500).json({'message': 'internal server error'});
                }
            }
        } else {
            // try to address issue
            capture({ downloadJobId, message: 'job not found' });
            res.status(404).json({'message': this._message404});
        }
    }

    @httpDelete('/torrent/:downloadTaskId')
    public async removeTorrent(@requestParam('downloadTaskId') downloadTaskId: string,
                               @response() res: ExpressResponse): Promise<void> {
        logger.info('remove torrent' + downloadTaskId);
        const repo = this._database.getJobRepository();
        const job = await repo.findOne({downloadTaskMessageId: downloadTaskId});
        if (job) {
            const torrentId = job.torrentId;
            await this._downloader.remove(torrentId, true);
            capture({message: 'remove torrent', downloadTaskId: downloadTaskId, torrentId: torrentId, job: job});
            res.status(200).json({'message': 'ok'});
        } else {
            capture({ downloadTaskId, message: 'unable to remove torrent, job not found'});
            res.status(404).json({'message': this._message404});
        }
    }
}