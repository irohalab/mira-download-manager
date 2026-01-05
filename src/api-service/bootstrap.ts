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


import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import { ConfigManager } from '../utils/ConfigManager';
import { Server } from 'http';
import cors = require('cors');

import './controller/FileController';
import './controller/RpcController';
import './controller/DownloadController';
import { TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../service/DatabaseService';
import { DownloadService } from '../service/DownloadService';
import { getStdLogger } from '../utils/Logger';
import { json, urlencoded } from 'express';

const DEBUG = process.env.DEBUG === 'true';
const logger = getStdLogger();

export function bootstrap(container: Container): Server {
    const expressServer = new InversifyExpressServer(container);
    const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
    const downloadService= container.get<DownloadService>(DownloadService);
    downloadService.start(false).then(() => {
        logger.info('connected to downloader');
    });
    expressServer.setConfig((theApp) => {
        theApp.use(urlencoded({
            extended: true
        }))
        theApp.use(json())
        theApp.use(databaseService.requestContextMiddleware());
        if (DEBUG) {
            theApp.use(cors());
        }
    });

    const app = expressServer.build();
    const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
    const server = app.listen(configManager.serverPort(), '0.0.0.0');
    logger.info('Server started on port ' + configManager.serverPort());
    return server;
}