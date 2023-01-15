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
import { ConfigManager } from '../utils/ConfigManager';
import { URL } from 'url';
import { copyFile, mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import axios from 'axios';
import { finished } from 'stream/promises';
import { basename, dirname, extname } from 'path';
import { nanoid } from 'nanoid';
import { DatabaseService } from './DatabaseService';
import { RemoteFile, Sentry, TYPES } from '@irohalab/mira-shared';
import { getStdLogger } from '../utils/Logger';

const logger = getStdLogger();

@injectable()
export class FileManageService {

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    public async download(remoteFile: RemoteFile, destPath: string, appId: string): Promise<void> {
        const idHostMap = this._configManager.appIdHostMap();
        const host = idHostMap[appId];
        let remoteUrl: string = null;
        if (host) {
            const hostURLObj = new URL(host);
            if (hostURLObj.hostname === 'localhost') {
                // COPY local file
                try {
                    await copyFile(remoteFile.fileLocalPath, destPath);
                } catch (err) {
                    logger.warn(err);
                    this._sentry.capture(err);
                }
                return;
            } else {
                // replace part
                const fileURLObj = new URL(remoteFile.fileUri);
                fileURLObj.host = hostURLObj.host;
                fileURLObj.protocol = hostURLObj.protocol;
                fileURLObj.pathname = FileManageService.trimEndSlash(hostURLObj.pathname) + fileURLObj.pathname;
                remoteUrl = fileURLObj.toString();
            }
        } else {
            remoteUrl = remoteFile.fileUri;
        }
        if (remoteUrl) {
            await FileManageService.getVideoViaHttp(remoteUrl, destPath);
        }
    }

    /**
     * add a random hash suffix, and replace reserved character ',' with '_'
     * @param filename
     */
    public static processFilename(filename: string): string {
        filename = filename.replace(/,/ig, '_');
        const randomHash = nanoid(5);
        const e = extname(filename);
        let b = basename(filename, e);
        b += '-' + randomHash;
        return b + e;
    }

    private static async getVideoViaHttp(sourceUrl: string, savePath: string): Promise<void> {
        const destDir = dirname(savePath);
        await mkdir(destDir, {recursive: true});
        const writer = createWriteStream(savePath);
        const response = await axios.get(sourceUrl, {
            responseType: 'stream'
        });
        response.data.pipe(writer);
        await finished(writer);
    }

    private static trimEndSlash(pathSeg: string) {
        return pathSeg.endsWith('/') ? pathSeg.substring(0, pathSeg.length - 1) : pathSeg;
    }
}