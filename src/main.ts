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

import 'reflect-metadata';
import { Container } from 'inversify';
import { ConfigManager } from './utils/ConfigManager';
import { TYPES } from './TYPES';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { DatabaseService } from './service/DatabaseService';
import { DatabaseServiceImpl } from './service/DatabaseServiceImpl';
import { RabbitMQService } from './service/RabbitMQService';
import { FileManageService } from './service/FileManageService';
import { DownloadService } from './service/DownloadService';
import { DownloadManager } from './DownloadManager';
import { DownloaderType } from './domain/DownloaderType';
import { DownloadAdapter } from './download-adapter/DownloadAdapter';
import { QBittorrentDownloadAdapter } from './download-adapter/QBittorrentDownloadAdapter';
import { DelugeDownloadAdapter } from './download-adapter/DelugeDownloadAdapter';

const container = new Container();

container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
const configManager = container.get<ConfigManager>(TYPES.ConfigManager);

const downloader = configManager.downloader() as DownloaderType;

switch (downloader) {
    case DownloaderType.Deluge:
        container.bind<DownloadAdapter>(TYPES.Downloader).to(DelugeDownloadAdapter).inSingletonScope();
        break;
    case DownloaderType.qBittorrent:
        container.bind<DownloadAdapter>(TYPES.Downloader).to(QBittorrentDownloadAdapter).inSingletonScope();
        break;
    default:
        throw new Error(`no downloader with name: ${downloader} is found`);
}

container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(RabbitMQService).toSelf().inSingletonScope();
container.bind<FileManageService>(FileManageService).toSelf().inSingletonScope();
container.bind<DownloadService>(DownloadService).toSelf().inSingletonScope();
container.bind<DownloadManager>(DownloadManager).toSelf().inSingletonScope();

const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
const downloadManager = container.get<DownloadManager>(DownloadManager);
const fileManageService = container.get<FileManageService>(FileManageService);

databaseService.start()
    .then(() => {
        return downloadManager.start();
    })
    .then(() => {
        console.log('download manager start');
        fileManageService.startCleanUp();
    }, (err) => {
        console.error(err);
        process.exit(-1);
    });

function beforeExitHandler() {
    fileManageService.stopCleanUp();
    downloadManager.stop()
        .then(() => {
            return databaseService.stop();
        })
        .then(() => {
            process.exit(0);
        }, (error) => {
            console.error(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);