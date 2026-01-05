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
    BaseHttpController,
    controller,
    httpDelete,
    httpGet, IHttpActionResult,
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
import { JsonResultFactory, Sentry, TYPES } from '@irohalab/mira-shared';
import { getStdLogger } from '../../utils/Logger';

const logger = getStdLogger();

@controller('/file')
export class FileController extends BaseHttpController implements interfaces.Controller {
    // private readonly _videoTempPath: string;
    private readonly _message404 = 'file not found';
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _database: DatabaseService,
                @inject(TYPES_DM.Downloader) private _downloader: DownloadAdapter,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
        super();
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
                    this._sentry.capture({ fileLocalPath, fsStatObj, message: 'path is not a file' });
                    res.status(404).json({'message': this._message404});
                    return;
                }
                logger.debug('fileLocalPath', fileLocalPath);
                await new Promise<void>((resolve, reject) => {
                    res.download(fileLocalPath, filename, (err) => {
                        if (err) {
                            logger.error('error when sending downloaded file' + err);
                            this._sentry.capture(err);
                            reject(err);
                        } else {
                            logger.info('Sent:', filename);
                            resolve();
                        }
                    });
                });
            } catch (e) {
                if (e.code === 'ENOENT') {
                    this._sentry.capture(e);
                    res.status(404).json({'message': this._message404});
                } else {
                    this._sentry.capture(e);
                    logger.error(e);
                    res.status(500).json({'message': 'internal server error'});
                }
            }
        } else {
            // try to address issue
            this._sentry.capture({ downloadJobId, message: 'job not found' });
            res.status(404).json({'message': this._message404});
        }
    }

    @httpDelete('/torrent/:downloadTaskId')
    public async removeTorrent(@requestParam('downloadTaskId') downloadTaskId: string,
                               @response() res: ExpressResponse): Promise<IHttpActionResult> {
        logger.info('remove torrent' + downloadTaskId);
        const repo = this._database.getJobRepository(true);
        try {
            const job = await repo.findOne({downloadTaskMessageId: downloadTaskId});
            if (job) {
                const torrentId = job.torrentId;
                await this._downloader.remove(torrentId, true);
                this._sentry.capture({message: 'remove torrent', downloadTaskId: downloadTaskId, torrentId: torrentId, job: job});
                return JsonResultFactory(200);
            } else {
                this._sentry.capture({ downloadTaskId, message: 'unable to remove torrent, job not found'});
                return JsonResultFactory(400);
            }
        } catch (ex) {
            logger.error(ex);
            return JsonResultFactory(500);
        }
    }
}