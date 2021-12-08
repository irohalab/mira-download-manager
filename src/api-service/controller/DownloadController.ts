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

import { controller, httpGet, interfaces, queryParam, response } from 'inversify-express-utils';
import { DatabaseService } from '../../service/DatabaseService';
import { JobStatus } from '../../domain/JobStatus';
import { ResponseWrapper } from '../ResponseWrapper';
import { DownloadJob } from '../../entity/DownloadJob';
import { inject } from 'inversify';
import { TYPES } from '../../TYPES';

@controller('/download')
export class DownloadController implements interfaces.Controller {
    constructor(@inject(TYPES.DatabaseService) private _database: DatabaseService) {
    }

    @httpGet('/job')
    public async listJobs(@queryParam('status') status: string): Promise<ResponseWrapper<DownloadJob[]>> {
        const jobStatus = status as JobStatus
        const jobs = await this._database.getJobRepository().find({
            where: {
                status: jobStatus
            },
            order: {
                createTime: 'DESC'
            }
        });
        return {
            data: jobs || [],
            status: 0
        };
    }
}