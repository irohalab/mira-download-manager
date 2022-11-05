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
import { TYPES_DM } from './TYPES_DM';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { DatabaseService } from './service/DatabaseService';
import { DatabaseServiceImpl } from './service/DatabaseServiceImpl';
import { bootstrap } from './api-service/bootstrap';
import { Server } from 'http';
import { DownloadAdapter } from './download-adapter/DownloadAdapter';
import { DelugeDownloadAdapter } from './download-adapter/DelugeDownloadAdapter';
import { QBittorrentDownloadAdapter } from './download-adapter/QBittorrentDownloadAdapter';
import { DownloaderType } from './domain/DownloaderType';
import { hostname } from 'os';
import {
    CORE_TASK_EXCHANGE,
    DOWNLOAD_MESSAGE_EXCHANGE,
    RabbitMQService,
    Sentry,
    SentryImpl,
    TYPES
} from '@irohalab/mira-shared';
import { DownloadService } from './service/DownloadService';
import { getStdLogger } from './utils/Logger';
import { RascalImpl } from '@irohalab/mira-shared/services/RascalImpl';

const logger = getStdLogger();

const container = new Container();

// tslint:disable-next-line
const { version } = require('../package.json');
container.bind<Sentry>(TYPES.Sentry).to(SentryImpl).inSingletonScope();
const sentry = container.get<Sentry>(TYPES.Sentry);
sentry.setup(`download_manager_api_server_${hostname()}`, 'mira-download-manager', version);

container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(TYPES.RabbitMQService).to(RascalImpl).inSingletonScope();

const downloader = container.get<ConfigManager>(TYPES.ConfigManager).downloader() as DownloaderType;

switch (downloader) {
    case DownloaderType.Deluge:
        container.bind<DownloadAdapter>(TYPES_DM.Downloader).to(DelugeDownloadAdapter).inSingletonScope();
        break;
    case DownloaderType.qBittorrent:
        container.bind<DownloadAdapter>(TYPES_DM.Downloader).to(QBittorrentDownloadAdapter).inSingletonScope();
        break;
    default:
        throw new Error(`no downloader with name: ${downloader} is found`);
}

container.bind<DownloadService>(DownloadService).toSelf().inSingletonScope();
const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
const downloadAdapter = container.get<DownloadAdapter>(TYPES_DM.Downloader);
const rabbitMQService = container.get<RabbitMQService>(TYPES.RabbitMQService);

let webServer: Server;

databaseService.start()
    .then(() => {
        return rabbitMQService.initPublisher(CORE_TASK_EXCHANGE, 'direct');
    })
    .then(() => {
        return rabbitMQService.initPublisher(DOWNLOAD_MESSAGE_EXCHANGE, 'direct');
    })
    .then(() => {
        return downloadAdapter.connect(false);
    })
    .then(() => {
        logger.debug((downloadAdapter as QBittorrentDownloadAdapter)._cookie);
        webServer = bootstrap(container);
    })
    .catch((error) =>  {
        logger.error(error);
        sentry.capture(error);
    });

function beforeExitHandler() {
    databaseService.stop()
        .then(() => {
            webServer.close();
            process.exit(0);
        }, (error) => {
            webServer.close();
            logger.error(error);
            sentry.capture(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);