/*
 * Copyright 2023 IROHA LAB
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

import { DatabaseService } from './DatabaseService';
import { ConfigManager } from '../utils/ConfigManager';
import { inject, injectable } from 'inversify';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { getStdLogger } from '../utils/Logger';
import { DownloadService } from './DownloadService';
import { rm } from 'fs/promises';
import { JobStatus } from '../domain/JobStatus';

const logger = getStdLogger();

const CHECK_INTERVAL = 24 * 3600 * 1000;
const CLEAN_UP_INTERVAL = 5 * 60000;

@injectable()
export class JobCleaner {
    private _checkTimer: NodeJS.Timeout;
    private _cleanUpTaskTimerId: NodeJS.Timeout;
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                private _downloadService: DownloadService,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    public start(): void {
        this.checkJob();
        this.startCleanUp();
    }

    public stop(): void {
        if (typeof(this._checkTimer) !== 'undefined') {
            clearTimeout(this._checkTimer);
        }
        if (typeof(this._cleanUpTaskTimerId) !== 'undefined') {
            clearTimeout(this._cleanUpTaskTimerId);
        }
    }

    private checkJob(): void {
        this._checkTimer = setTimeout(async() => {
            await this.doCheckJob();
            this.checkJob();
        }, CHECK_INTERVAL);
    }

    private async doCheckJob(): Promise<void> {
        const expireTime = this._configManager.getCompletedJobRetentionDays() * 24 * 3600 * 1000;
        const jobRepo = this._databaseService.getJobRepository();
        try {
            const jobs = await jobRepo.getJobCanBeCleanUp(expireTime);
            for (const job of jobs) {
                try {
                    await this._downloadService.delete(job, false);
                    logger.info(`job#${job.id} removed!`);
                } catch (ex) {
                    logger.warn(`job#${job.id} removed but the torrent not exists!`);
                    job.status = JobStatus.Removed;
                }
            }
            await jobRepo.save(jobs);
        } catch (ex) {
            logger.error(ex);
            this._sentry.capture(ex);
        }
    }



    public startCleanUp(): void {
        this._cleanUpTaskTimerId = setTimeout(async () => {
            try {
                await this.doCleanUp();
            } catch (e) {
                logger.warn(e);
            }
            this.startCleanUp();
        }, CLEAN_UP_INTERVAL);
    }

    public stopCleanUp(): void {
        clearTimeout(this._cleanUpTaskTimerId);
    }

    private async doCleanUp(): Promise<void> {
        const taskRepo = this._databaseService.getCleanUpTaskRepository();
        const tasks = await taskRepo.findAll();
        if (tasks && tasks.length > 0) {
            for (let task of tasks) {
                try {
                    logger.info('try to clean up folder ' + task.directoryPath);
                    await rm(task.directoryPath, {
                        force: true,
                        maxRetries: 2,
                        retryDelay: 1000,
                        recursive: true
                    });
                    taskRepo.remove(task);
                } catch (e) {
                    if (e.code !== 'ENOENT') {
                        logger.warn(e);
                    } else {
                        taskRepo.remove(task);
                    }
                }
            }
            await taskRepo.flush();
        }
    }

}