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
import { TYPES } from '../../TYPES';
import { ConfigManager } from '../../utils/ConfigManager';
import { join, basename } from 'path';
import { stat } from 'fs/promises';
import { DatabaseService } from '../../service/DatabaseService';
import { DownloadAdapter } from '../../download-adapter/DownloadAdapter';
import { QBittorrentDownloadAdapter } from '../../download-adapter/QBittorrentDownloadAdapter';

@controller('/file')
export class FileController implements interfaces.Controller {
    // private readonly _videoTempPath: string;
    private readonly _message404 = 'file not found';
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _database: DatabaseService,
                @inject(TYPES.Downloader) private _downloader: DownloadAdapter) {
        // this._videoTempPath = this._configManager.videoFileTempDir();
    }

    @httpGet('/content/:downloadJobId')
    public async downloadContent(@requestParam('downloadJobId') downloadJobId: string,
                         @queryParam('relativeFilePath') relativeFilePath: string,
                         @response() res: ExpressResponse): Promise<void> {
        console.log((<QBittorrentDownloadAdapter> this._downloader)._cookie);
        const job = await this._database.getJobRepository().findOne({id: downloadJobId});
        if (job) {
            const torrentId = job.torrentId;
            const torrentInfo = await this._downloader.getTorrentInfo(torrentId);
            const savePath = torrentInfo.save_path;
            const fileLocalPath = join(savePath, relativeFilePath);
            const filename = basename(relativeFilePath);
            try {
                console.log(filename);
                const fsStatObj = await stat(fileLocalPath);
                if (!fsStatObj.isFile()) {
                    res.status(404).json({'message': this._message404});
                    return;
                }
                console.log('fileLocalPath', fileLocalPath);
                await new Promise<void>((resolve, reject) => {
                    res.download(fileLocalPath, filename, (err) => {
                        if (err) {
                            console.error(err);
                            reject(err);
                        } else {
                            console.log('Sent:', filename);
                            resolve();
                        }
                    });
                });
            } catch (e) {
                if (e.code === 'ENOENT') {
                    res.status(404).json({'message': this._message404});
                }
            }
        } else {
            res.status(404).json({'message': this._message404});
        }
    }

    @httpDelete('/torrent/:downloadTaskId')
    public async removeTorrent(@requestParam('downloadTaskId') downloadTaskId: string,
                               @response() res: ExpressResponse): Promise<void> {
        console.log('remove torrent' + downloadTaskId);
        const repo = this._database.getJobRepository();
        const job = await repo.findOne({downloadTaskMessageId: downloadTaskId});
        if (job) {
            const torrentId = job.torrentId;
            await this._downloader.remove(torrentId, true);
            res.status(200).json({'message': 'ok'});
        } else {
            res.status(404).json({'message': this._message404});
        }
    }
}