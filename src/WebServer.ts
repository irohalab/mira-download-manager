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
import { capture, setup as setupSentry } from './utils/sentry';
import { Container } from 'inversify';
import { ConfigManager } from './utils/ConfigManager';
import { CORE_TASK_EXCHANGE, TYPES } from './TYPES';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { DatabaseService } from './service/DatabaseService';
import { DatabaseServiceImpl } from './service/DatabaseServiceImpl';
import { bootstrap } from './api-service/bootstrap';
import { Server } from 'http';
import { DownloadAdapter } from './download-adapter/DownloadAdapter';
import { DelugeDownloadAdapter } from './download-adapter/DelugeDownloadAdapter';
import { QBittorrentDownloadAdapter } from './download-adapter/QBittorrentDownloadAdapter';
import { RabbitMQService } from './service/RabbitMQService';
import { DownloaderType } from './domain/DownloaderType';
import pino from 'pino';
import { hostname } from 'os';

const logger = pino();
setupSentry(`download_manager_api_server_${hostname()}`);

const container = new Container();
container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(RabbitMQService).toSelf().inSingletonScope();

const downloader = container.get<ConfigManager>(TYPES.ConfigManager).downloader() as DownloaderType;

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

const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
const downloadAdapter = container.get<DownloadAdapter>(TYPES.Downloader);
const rabbitMQService = container.get<RabbitMQService>(RabbitMQService);

let webServer: Server;

databaseService.start()
    .then(() => {
        return rabbitMQService.initPublisher(CORE_TASK_EXCHANGE, 'direct');
    })
    .then(() => {
        return downloadAdapter.connect(false);
    })
    .then(() => {
        logger.debug((downloadAdapter as QBittorrentDownloadAdapter)._cookie);
        webServer = bootstrap(container);
    })
    .catch((error) =>  {
        capture(error);
        logger.error(error);
    });

function beforeExitHandler() {
    databaseService.stop()
        .then(() => {
            webServer.close();
            process.exit(0);
        }, (error) => {
            webServer.close();
            capture(error);
            logger.error(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);