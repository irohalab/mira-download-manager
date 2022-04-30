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

    public async listJobByStatusWithDescOrder(status: JobStatus): Promise<DownloadJob[]> {
        return await this.find({status}, {orderBy: {createTime: 'DESC'}});
    }
}
