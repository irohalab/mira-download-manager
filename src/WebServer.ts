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

import 'reflect-metadata';
import { Container } from 'inversify';
import { ConfigManager } from './utils/ConfigManager';
import { TYPES } from './TYPES';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { DatabaseService } from './service/DatabaseService';
import { DatabaseServiceImpl } from './service/DatabaseServiceImpl';
import { bootstrap } from './api-service/bootstrap';
import { Server } from 'http';
import { DownloadAdapter } from './download-adapter/DownloadAdapter';
import { DelugeDownloadAdapter } from './download-adapter/DelugeDownloadAdapter';
import { QBittorrentDownloadAdapter } from './download-adapter/QBittorrentDownloadAdapter';

const container = new Container();
container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();

const downloader = container.get<ConfigManager>(TYPES.ConfigManager).downloader();

switch (downloader) {
    case 'deluge':
        container.bind<DownloadAdapter>(TYPES.Downloader).to(DelugeDownloadAdapter).inSingletonScope();
        break;
    case 'qbittorrent':
        container.bind<DownloadAdapter>(TYPES.Downloader).to(QBittorrentDownloadAdapter).inSingletonScope();
        break;
    default:
        throw new Error(`no downloader with name: ${downloader} is found`);
}

const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
const downloadAdapter = container.get<DownloadAdapter>(TYPES.Downloader);

let webServer: Server;

databaseService.start()
    .then(() => {
        return downloadAdapter.connect(false);
    })
    .then(() => {
        webServer = bootstrap(container);
    });

function beforeExitHandler() {
    databaseService.stop()
        .then(() => {
            webServer.close();
            process.exit(0);
        }, (error) => {
            webServer.close();
            console.error(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);