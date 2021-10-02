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

import { EntityRepository, Repository } from 'typeorm';
import { DownloadJob } from '../entity/DownloadJob';
import { DownloaderType } from '../domain/DownloaderType';
import { JobStatus } from '../domain/JobStatus';

@EntityRepository(DownloadJob)
export class DownloadJobRepository extends Repository<DownloadJob> {
    public async listUnsettledJobs(downloaderType: DownloaderType): Promise<DownloadJob[]> {
        return await this.createQueryBuilder('download_job')
            .where('download_job.downloader = :downloader', {downloader: downloaderType})
            .andWhere('download_job.status = :pending_status OR download_job.status = :downloading_status OR' +
                ' download_job.status = :paused_status',
                {
                    pending_status: JobStatus.Pending,
                    downloading_status: JobStatus.Downloading,
                    paused_status: JobStatus.Paused})
            .getMany();
    }
}
