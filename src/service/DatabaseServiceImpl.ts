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

import { inject, injectable } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { DownloadJobRepository } from '../repository/DownloadJobRepository';
import { CleanUpTaskRepository } from '../repository/CleanUpTaskRepository';
import { DatabaseService } from './DatabaseService';
import { BasicDatabaseServiceImpl, TYPES } from '@irohalab/mira-shared';
import { DownloadJob } from '../entity/DownloadJob';
import { CleanUpTask } from '../entity/CleanUpTask';
import { getStdLogger } from '../utils/Logger';
import { DownloadedObject } from '../entity/DownloadedObject';
import { DownloadedObjectsRepository } from '../repository/DownloadedObjectsRepository';

const logger = getStdLogger();

@injectable()
export class DatabaseServiceImpl extends BasicDatabaseServiceImpl implements DatabaseService {

    constructor(@inject(TYPES.ConfigManager) configManager: ConfigManager) {
        super(configManager);
    }

    public getDownloadedObjectRepository(useRequestContext: boolean = false): DownloadedObjectsRepository {
        return this._em.fork({useContext: useRequestContext}).getRepository(DownloadedObject) as DownloadedObjectsRepository;
    }

    public getJobRepository(useRequestContext: boolean = false): DownloadJobRepository {
        return this._em.fork({useContext: useRequestContext}).getRepository(DownloadJob) as DownloadJobRepository;
    }

    public getCleanUpTaskRepository(): CleanUpTaskRepository {
        return this._em.fork().getRepository(CleanUpTask) as CleanUpTaskRepository;
    }

    public async initSchema(): Promise<void> {
        try {
            await this.syncSchema();
        } catch (e) {
            logger.error(e);
        }
    }
}