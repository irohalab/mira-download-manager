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

import { DownloadJob } from '../entity/DownloadJob';
import { DownloaderType } from '../domain/DownloaderType';
import { JobStatus } from '../domain/JobStatus';
import { BaseEntityRepository } from '@irohalab/mira-shared/repository/BaseEntityRepository';
import { FilterQuery, FindOptions } from '@mikro-orm/core';

export class DownloadJobRepository extends BaseEntityRepository<DownloadJob> {
    public async listUnsettledJobs(downloaderType: DownloaderType): Promise<DownloadJob[]> {
        return await this.find({
            $and: [
                {downloader: downloaderType},
                {
                    $or: [
                        {status: JobStatus.Pending},
                        {status: JobStatus.Downloading},
                        {status: JobStatus.Paused}
                    ]
                }
            ]
        });
    }

    public async listJobs(status:  JobStatus | 'all', bangumiId?: string): Promise<DownloadJob[]> {
        const queryFilter: FilterQuery<DownloadJob> = {};
        const findOptions: FindOptions<DownloadJob> = {
            orderBy: {createTime: 'DESC'}
        };
        if (status === 'all') {
            findOptions.limit = 30;
        } else {
            queryFilter.status = status;
        }
        if (bangumiId) {
            queryFilter.bangumiId = bangumiId;
        }
        return await this.find(queryFilter, findOptions);
    }

    public async getJobCanBeCleanUp(expireTime: number): Promise<DownloadJob[]> {
        const latestEndTime = new Date(Date.now() - expireTime);
        return await this.find({
            $and: [
                {status: JobStatus.Complete},
                {
                    endTime: {$lt: latestEndTime}
                }
            ]
        });
    }
}
