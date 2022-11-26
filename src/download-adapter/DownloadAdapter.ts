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

import { TorrentFile } from '../domain/TorrentFile';
import { Observable } from 'rxjs';
import { TorrentInfo } from '../domain/TorrentInfo';

export interface DownloadAdapter {
    /**
     * connect the adapter to daemon
     * @param enableEvent, whether enable listening on download event.
     * set to false if only want to call the method of downloader
     */
    connect(enableEvent: boolean): Promise<void>;

    /**
     * Download a torrent from url or a magnet uri. return the unique id for the torrent
     * @param torrentUrlOrMagnet
     * @param downloadLocation
     */
    download(torrentUrlOrMagnet: string, downloadLocation: string): Promise<string>;

    /**
     * Pause a torrent
     */
    pause(torrentId: string): Promise<void>;

    /**
     * Resume a paused torrent
     */
    resume(torrentId: string): Promise<void>;

    /**
     * Remove a torrent
     */
    remove(torrentId: string, deleteFiles: boolean): Promise<void>;

    /**
     * emit an observable when a status of torrent is changed.
     * emit the id of DownloadJob
     */
    downloadStatusChanged(): Observable<string>;

    /**
     * emit and observable when a torrent is deleted.
     * * emit the id of DownloadJob
     */
    torrentDeleteEvent(): Observable<string>;

    getTorrentContent(torrentId: string): Promise<TorrentFile[]>;
    getTorrentInfo(torrentId: string): Promise<TorrentInfo>;
}