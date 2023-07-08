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

import {
    BaseHttpController,
    controller,
    httpGet,
    httpPut, IHttpActionResult,
    interfaces,
    queryParam,
    request,
    requestParam,
    response
} from 'inversify-express-utils';
import { Request, Response as ExpressResponse } from 'express';
import { DatabaseService } from '../../service/DatabaseService';
import { JobStatus } from '../../domain/JobStatus';
import { DownloadJob } from '../../entity/DownloadJob';
import { inject } from 'inversify';
import { ResponseWrapper, TYPES } from '@irohalab/mira-shared';
import { DownloadService } from '../../service/DownloadService';
import { getStdLogger } from '../../utils/Logger';
import { InternalServerErrorResult, NotFoundResult } from 'inversify-express-utils/lib/results';

type Operation = { action: 'pause' | 'resume' | 'delete' };

const OP_PAUSE = 'pause';
const OP_RESUME = 'resume';
const OP_DELETE = 'delete';

const logger = getStdLogger();

@controller('/download')
export class DownloadController extends BaseHttpController implements interfaces.Controller {
    constructor(@inject(TYPES.DatabaseService) private _database: DatabaseService,
                private _downloadService: DownloadService) {
        super();
    }

    @httpGet('/job')
    public async listJobs(@queryParam('status') status: string): Promise<IHttpActionResult> {
        const jobStatus = status as JobStatus
        const jobs = await this._database.getJobRepository(true).listJobByStatusWithDescOrder(jobStatus);
        return this.json({
            data: jobs || [],
            status: 0
        });
    }

    @httpGet('/job/:id')
    public async getJob(@requestParam('id') id: string): Promise<IHttpActionResult> {
        const job = await this._database.getJobRepository(true).findOne({ id });
        if (job) {
            return this.json({
                data: job,
                status: 0
            });
        } else {
            return new NotFoundResult();
        }
    }

    @httpPut('/job/:id')
    public async jobOperation(@request() req: Request, @response() res: ExpressResponse): Promise<IHttpActionResult> {
        const id = req.params.id;
        const op = req.body as Operation;
        const jobRepo = this._database.getJobRepository(true);
        const job = await jobRepo.findOne({ id });
        if (job) {
            switch(op.action) {
                case OP_PAUSE:
                    await this._downloadService.pause(job);
                    break;
                case OP_RESUME:
                    await this._downloadService.resume(job);
                    break;
                case OP_DELETE:
                    await this._downloadService.delete(job);
                    break;
                default:
                    res.status(400).json({data: null, message: 'invalid action', status: 2});
                    return;
            }
            await jobRepo.save(job);
            return this.json({data: null, message: 'OK', status: 0});
        } else {
            return new NotFoundResult();
        }
    }

    @httpPut('/job/:id/resend-finish-message')
    public async resendFinishMessage(@requestParam('id') jobId: string): Promise<IHttpActionResult> {
        const job = await this._database.getJobRepository(true).findOne({ id: jobId});
        if (job) {
            console.log(job);
            try {
                await this._downloadService.downloadComplete(job);
            } catch (ex) {
                logger.error(ex);
                return this.json({
                    data: ex,
                    message: 'error while trying to resent message',
                    status: 0
                });
            }
            return this.json({
                data: null,
                message: 'message resent!',
                status: 0
            });
        } else {
            return this.json({
                data: null,
                message: 'Job not found',
                status: 1
            });
        }
    }

    @httpGet('/job/:id/content')
    public async getTorrentContent(@requestParam('id') jobId: string): Promise<IHttpActionResult> {
        const job = await this._database.getJobRepository(true).findOne({id: jobId});
        if (job) {
            try {
                const files = await this._downloadService.getTorrentContent(job.torrentId);
                return this.json({
                    data: files,
                    status: 0
                });
            } catch (ex) {
                logger.error(ex);
                return new InternalServerErrorResult();
            }
        } else {
            return new NotFoundResult();
        }
    }
}