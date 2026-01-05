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
import { TYPES_DM } from './TYPES_DM';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { DatabaseService } from './service/DatabaseService';
import { DatabaseServiceImpl } from './service/DatabaseServiceImpl';
import { RabbitMQService, Sentry, SentryImpl, TYPES } from '@irohalab/mira-shared';
import { FileManageService } from './service/FileManageService';
import { DownloadService } from './service/DownloadService';
import { DownloadManager } from './DownloadManager';
import { DownloaderType } from './domain/DownloaderType';
import { DownloadAdapter } from './download-adapter/DownloadAdapter';
import { QBittorrentDownloadAdapter } from './download-adapter/QBittorrentDownloadAdapter';
import { DelugeDownloadAdapter } from './download-adapter/DelugeDownloadAdapter';
import { hostname } from 'os';
import { getStdLogger } from './utils/Logger';
import { RascalImpl } from '@irohalab/mira-shared/services/RascalImpl';
import { JobCleaner } from './service/JobCleaner';
import { S3Service } from './service/S3Service';


const logger = getStdLogger();

const container = new Container();

// tslint:disable-next-line
const { version } = require('../package.json');
container.bind<Sentry>(TYPES.Sentry).to(SentryImpl).inSingletonScope();
const sentry = container.get<Sentry>(TYPES.Sentry);
sentry.setup(`download_manager_${hostname()}`, 'mira-download-manager', version);

container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl).inSingletonScope();
const configManager = container.get<ConfigManager>(TYPES.ConfigManager);

const downloader = configManager.downloader() as DownloaderType;

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

container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl).inSingletonScope();
container.bind<RabbitMQService>(TYPES.RabbitMQService).to(RascalImpl).inSingletonScope();
container.bind<FileManageService>(FileManageService).toSelf().inSingletonScope();
container.bind<DownloadService>(DownloadService).toSelf().inSingletonScope();
container.bind<DownloadManager>(DownloadManager).toSelf().inSingletonScope();
container.bind<JobCleaner>(JobCleaner).toSelf().inSingletonScope();
container.bind<S3Service>(S3Service).toSelf().inSingletonScope();

const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
const downloadManager = container.get<DownloadManager>(DownloadManager);
const jobCleaner = container.get<JobCleaner>(JobCleaner);
const s3Service = container.get<S3Service>(S3Service);

databaseService.start()
    .then(async () => {
        await s3Service.ensureBucket();
        await downloadManager.start();
        jobCleaner.start();
        logger.info('download manager start');
    })
    .catch((err) => {
        logger.error(err);
        sentry.capture(err);
        process.exit(-1);
    });

function beforeExitHandler() {
    jobCleaner.stop();
    downloadManager.stop()
        .then(() => {
            return databaseService.stop();
        })
        .then(() => {
            process.exit(0);
        }, (error) => {
            logger.error(error);
            sentry.capture(error);
            process.exit(-1);
        });
}

process.on('SIGINT', beforeExitHandler);
process.on('SIGTERM', beforeExitHandler);
process.on('SIGHUP', beforeExitHandler);