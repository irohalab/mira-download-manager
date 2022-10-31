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

import { controller, httpGet, httpPut, interfaces, queryParam, requestParam } from 'inversify-express-utils';
import { DatabaseService } from '../../service/DatabaseService';
import { JobStatus } from '../../domain/JobStatus';
import { DownloadJob } from '../../entity/DownloadJob';
import { inject } from 'inversify';
import { ResponseWrapper, TYPES } from '@irohalab/mira-shared';
import { DownloadService } from '../../service/DownloadService';

@controller('/download')
export class DownloadController implements interfaces.Controller {
    constructor(@inject(TYPES.DatabaseService) private _database: DatabaseService,
                private _downloadService: DownloadService) {
    }

    @httpGet('/job')
    public async listJobs(@queryParam('status') status: string): Promise<ResponseWrapper<DownloadJob[]>> {
        const jobStatus = status as JobStatus
        const jobs = await this._database.getJobRepository(true).listJobByStatusWithDescOrder(jobStatus);
        return {
            data: jobs || [],
            status: 0
        };
    }

    @httpPut('/job/:id/resend-finish-message')
    public async resendFinishMessage(@requestParam('id') jobId: string): Promise<ResponseWrapper<any>> {
        const job = await this._database.getJobRepository(true).findOne({ id: jobId});
        if (job) {
            console.log(job);
            await this._downloadService.downloadComplete(job);
            return {
                data: null,
                message: 'message resent!',
                status: 0
            }
        } else {
            return {
                data: null,
                message: 'Job not found',
                status: 1
            }
        }
    }
}