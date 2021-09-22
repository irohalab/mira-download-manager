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
import { inject, injectable } from 'inversify';
import { BehaviorSubject, Observable, Subject } from 'rxjs/dist/types';
import { TYPES } from '../TYPES';
import { ConfigManager } from '../utils/ConfigManager';
import axios from 'axios';
import * as FormData from 'form-data';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { QBittorrentInfo } from '../domain/QBittorrentInfo';
import { DatabaseService } from '../service/DatabaseService';
import { DownloaderType } from '../domain/DownloaderType';
import { QBittorrentState } from '../domain/QBittorrentState';
import { DownloadJob } from '../entity/DownloadJob';
import { JobStatus } from '../domain/JobStatus';
import Timer = NodeJS.Timer;
import { TorrentFile } from '../domain/TorrentFile';
import { TorrentInfo } from '../domain/TorrentInfo';

const TMP_ID_SIZE = 8;
const REFRESH_INFO_INTERVAL = 5000;

@injectable()
export class QBittorrentDownloadAdapter implements DownloadAdapter {
    private readonly _baseUrl: string;
    private _cookie: string;
    private _timerId: Timer;
    private _statusChangeSubject = new BehaviorSubject<string>(null);
    private _deleteSubject = new BehaviorSubject<string>(null);

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
        this._baseUrl = this._configManager.getQBittorrentConfig().api_url;
    }
    public async connect(enableEvent:boolean): Promise<void> {
        await this.login();
        if (enableEvent) {
            this.checkTorrentStatus();
        }
    }

    public async download(torrentUrlOrMagnet: string, downloadLocation: string): Promise<string> {
        let savePath = downloadLocation || this._configManager.defaultDownloadLocation();
        const tmpId = nanoid(TMP_ID_SIZE);
        savePath = join(savePath, tmpId);
        const form = new FormData();
        form.append('urls', torrentUrlOrMagnet);
        form.append('savepath', savePath);
        form.append('tags', tmpId);
        const headers = form.getHeaders({
            Cookie: this._cookie,
            'Content-Length': form.getLengthSync()
        });
        await axios.post(`${this._baseUrl}/torrents/add`, form, {
            headers
        });
        // get torrent info list
        const resp = await axios.get(`${this._baseUrl}/torrents/info`, {
            params: {
                tag: tmpId
            },
            headers: {cookie: this._cookie}
        });
        if (resp.data && resp.data.length === 1) {
            const hash = resp.data[0].hash;
            // remove tags
            await axios.post(`${this._baseUrl}/torrents/removeTags`, null, {
                params: {
                    hashes: hash,
                    tags: tmpId
                },
                headers: {Cookie: this._cookie}
            });
            return hash;
        } else {
            throw new Error('Torrent added but not find in qBittorrent');
        }
    }

    public async remove(torrentId: string, deleteFiles: boolean): Promise<void> {
        await axios.get(`${this._baseUrl}/torrents/delete`, {
            params: {
                hashes: torrentId,
                deleteFiles: deleteFiles
            },
            headers: {Cookie: this._cookie}
        });
    }

    public async getTorrentInfo(torrentId: string): Promise<TorrentInfo> {
        const response = await axios.get(`${this._baseUrl}/torrents/properties`, {
            params: {
                hash: torrentId.toLocaleLowerCase()
            },
            headers: {Cookie: this._cookie}
        });
        return response.data as TorrentInfo;
    }

    public async getTorrentContent(torrentId: string): Promise<TorrentFile[]> {
        const response = await axios.get(`${this._baseUrl}/torrents/files`, {
            params: {
                hash: torrentId.toLocaleLowerCase()
            },
            headers: {Cookie: this._cookie}
        });
        return response.data.filter(f => {
            return f.progress === 1;
        }) as TorrentFile[];
    }

    public downloadStatusChanged(): Observable<string> {
        return this._statusChangeSubject.asObservable();
    }
    public torrentDeleteEvent(): Observable<string> {
        return this._deleteSubject.asObservable();
    }

    private async login(): Promise<void> {
        const config = this._configManager.getQBittorrentConfig();
        const username = config.username;
        const password = config.password;
        const response = await axios.get(`${this._baseUrl}/login`, {
            params:{ username, password }
        });
        const cookies = response.headers['set-cookie'];
        if (Array.isArray(cookies)) {
            this._cookie = cookies.filter(cookie => cookie.includes('SID='))[0];
        } else {
            throw new Error('Auth failed, set-cookie is not an array');
        }
    }

    private checkTorrentStatus(): void {
        this._databaseService.getJobRepository().listUnsettledJobs(DownloaderType.qBittorrent)
            .then((jobs) => {
                axios.get(`${this._baseUrl}/torrents/info`, {
                    headers: {Cookie: this._cookie}
                })
                    .then(res => res.data as QBittorrentInfo[])
                    .then(infoList => {
                        const infoIdMapping = {};
                        for (let i = 0; i < infoList.length; i++) {
                            infoIdMapping[infoList[i].hash] = i;
                        }
                        let idx, info;
                        const changedJobs = [];
                        for (const job of jobs) {
                            idx = infoIdMapping[job.torrentId];
                            if (idx) {
                                info = infoList[idx];
                                const status = QBittorrentDownloadAdapter.convertStateToJobStatus(info.state);
                                if (status !== job.status) {
                                    job.status = status;
                                    changedJobs.push(job);
                                }
                            } else {
                                // torrent got deleted
                                job.status = JobStatus.Removed;
                                changedJobs.push(job);
                            }
                        }
                        if (changedJobs.length > 0) {
                            return this.updateJobStatus(changedJobs)
                                .then(() => {
                                    for (const job of changedJobs) {
                                        if (job.status === JobStatus.Removed) {
                                            this.notifyTorrentDelete(job);
                                        } else {
                                            this.notifyStatusChanged(job);
                                        }
                                    }
                                });
                        }
                    })
                    .then(() => {
                        this._timerId = setTimeout(() => {
                            this.checkTorrentStatus();
                        }, REFRESH_INFO_INTERVAL);
                    });
            });
    }

    private notifyTorrentDelete(job: DownloadJob) {
        this._deleteSubject.next(job.id);
    }

    private notifyStatusChanged(job: DownloadJob) {
        this._statusChangeSubject.next(job.id);
    }

    private async updateJobStatus(jobs: DownloadJob[]): Promise<void> {
        try {
            await this._databaseService.getJobRepository().save(jobs);
        } catch (ex) {
            console.error(ex);
        }
    }

    private static convertStateToJobStatus(state: string): JobStatus {
        switch (state) {
            case QBittorrentState.error:
            case QBittorrentState.missingFiles:
                return JobStatus.Error;
            case QBittorrentState.queuedDL:
            case QBittorrentState.allocating:
            case QBittorrentState.checkingDL:
            case QBittorrentState.checkingResumeData:
            case QBittorrentState.unknown:
                return JobStatus.Pending;
            case QBittorrentState.downloading:
            case QBittorrentState.stalledDL:
            case QBittorrentState.forcedDL:
            case QBittorrentState.metaDL:
                return JobStatus.Downloading;
            case QBittorrentState.uploading:
            case QBittorrentState.checkingUP:
            case QBittorrentState.pausedUP:
            case QBittorrentState.forcedUP:
            case QBittorrentState.stalledUP:
            case QBittorrentState.queuedUP:
                return JobStatus.Complete;
            case QBittorrentState.pausedDL:
                return JobStatus.Paused;
            default:
                return JobStatus.Removed;
        }
    }
}