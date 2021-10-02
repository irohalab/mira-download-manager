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

import parseTorrent = require("parse-torrent");
import { URL } from 'url';
import * as fs from 'fs';

export function getTorrentHash(urlOrMagnet: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(urlOrMagnet);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
            parseTorrent.remote(urlOrMagnet, (err, parsedTorrent) => {
                if (err) {
                    reject(err);
                }
                try {
                    const hash = parsedTorrent.infoHash;
                    resolve(hash);
                } catch (e) {
                    reject(e);
                }
            });
        } else if (urlObj.protocol === 'magnet:') {
            try {
                const hash = parseTorrent(urlOrMagnet).infoHash;
                resolve(hash);
            } catch (e) {
                reject(e);
            }
        } else {
            fs.readFile(urlOrMagnet, (err, buffer) => {
                if (err) {
                    reject(err);
                }
                resolve(parseTorrent(buffer).infoHash);
            });
        }
    });
}