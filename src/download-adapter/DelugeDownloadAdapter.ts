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

import { DownloadAdapter } from './DownloadAdapter';
import { Observable } from 'rxjs';
import { inject, injectable } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import axios, { AxiosResponse } from 'axios';
import { v4 as uuid4 } from 'uuid';
import { URL } from 'url';
import { nanoid } from 'nanoid';
import { join } from 'path';
import { TYPES } from '@irohalab/mira-shared';

type DelugeRPCResponse = {
    result: any;
    error: any;
    id: string;
}

const TMP_ID_SIZE = 8;

/**
 * TODO: finish all features
 */
@injectable()
export class DelugeDownloadAdapter implements DownloadAdapter {
    private readonly _delugeRpcUrl: string;
    private cookie: string;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager) {
        this._delugeRpcUrl = this._configManager.delugeRPCUrl()
    }

    public async connect(enableEvent:boolean): Promise<void> {
        if (!await this.auth()) {
            throw new Error('Auth Failed');
        }
        const hosts = await this.invoke('web.get_hosts', []);
        const host = hosts[0][0];
        await this.invoke('web.connect', [host]);
    }

    public async download(torrentUrlOrMagnet: string, downloadLocation: string): Promise<string> {
        let savePath = downloadLocation || this._configManager.defaultDownloadLocation();
        const tmpId = nanoid(TMP_ID_SIZE);
        savePath = join(savePath, tmpId);
        let torrent: string;
        let urlObj: URL;
        try {
            urlObj = new URL(torrentUrlOrMagnet);
        } catch (ex) {
            console.error(ex);
        }
        if (urlObj && urlObj.protocol !== 'magnet:') {
            torrent = await this.invoke('web.download_torrent_from_url', [torrentUrlOrMagnet, this.cookie]);
        } else {
            torrent = torrentUrlOrMagnet;
        }
        const config = {
            path: torrent,
            options: {
                file_properties: [],
                add_paused: false,
                compact_allocation: true,
                max_connections: -1,
                max_upload_slots: -1,
                max_upload_speed: -1,
                prioritize_first_last_pieces: false
            }
        }
        config.options['download_location'] = savePath;
        return await this.invoke('web.add_torrents', [[config]]);
    }

    public async remove(torrentId: string, deleteFiles: boolean): Promise<void> {
        return Promise.resolve(undefined);
    }

    public torrentDeleteEvent(): Observable<string> {
        return undefined;
    }

    private async makeRequest(method, params): Promise<AxiosResponse> {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }
        return await axios.request({
            url: this._delugeRpcUrl,
            method: 'post',
            data: {
                method,
                params,
                id: uuid4()
            },
            withCredentials: true,
            headers
        });
    }

    private async invoke(method, params): Promise<any> {
        try {
            const resp = await this.makeRequest(method, params);
            const rpcResp = resp.data as DelugeRPCResponse;
            if (rpcResp.error) {
                console.error(rpcResp.error);
            } else {
                return rpcResp.result;
            }
        } catch (ex) {
            console.error(ex);
        }
        return null;
    }

    private async auth(): Promise<boolean> {
        const password = this._configManager.delugePass();
        try {
            const { data, headers } = await this.makeRequest('auth.login', [password]);
            if (!data.result) {
                console.error('Deluge auth failed');
                return false
            }
            this.cookie = headers['Set-Cookie'][0].split(';')[0];
            return true;
        } catch (ex) {
            console.error(ex);
        }
        return false;
    }

    public downloadStatusChanged(): Observable<string> {
        return undefined;
    }
    getTorrentContent(torrentId: string): Promise<import("../domain/TorrentFile").TorrentFile[]> {
        throw new Error("Method not implemented.");
    }
    getTorrentInfo(torrentId: string): Promise<import("../domain/TorrentInfo").TorrentInfo> {
        throw new Error("Method not implemented.");
    }
}