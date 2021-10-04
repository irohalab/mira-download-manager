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

import { DownloadAdapter } from '../download-adapter/DownloadAdapter';
import { Observable, of } from 'rxjs/dist/types';
import { TorrentFile } from '../domain/TorrentFile';
import { TorrentInfo } from '../domain/TorrentInfo';

type Torrent = {
    id: string;
    info: TorrentInfo;
    content: TorrentFile[];
};

export class FakeDownloadAdapter implements DownloadAdapter {
    private torrents: Torrent[] = [
        {
            id: 'abc1',
            info: {
                save_path: '',
                creation_date: Date.now() - 10000,
                share_ratio: 0,
                completion_date: Date.now() - 10,
                time_elapsed: 9.990, // seconds
                addition_date: Date.now() - 10000
            },
            content: [{
                index: '1',
                name: 'abc.mp4',
                size: 10240,
                progress: 100,
            }]
        }
    ];
    constructor() {
    }

    public connect(enableEvent: boolean): Promise<void> {
        setTimeout(() => {
            this.downloadStatusChanged();
        }, 500);
        return Promise.resolve();
    }

    public download(torrentUrlOrMagnet: string, downloadLocation: string): Promise<string> {
        return Promise.resolve('');
    }

    public downloadStatusChanged(): Observable<string> {
        return of('abc1');
    }

    public getTorrentContent(torrentId: string): Promise<TorrentFile[]> {
        return Promise.resolve([]);
    }

    public getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
        return Promise.resolve(undefined);
    }

    public remove(torrentId: string, deleteFiles: boolean): Promise<void> {
        return Promise.resolve(undefined);
    }

    public torrentDeleteEvent(): Observable<string> {
        return undefined;
    }
}