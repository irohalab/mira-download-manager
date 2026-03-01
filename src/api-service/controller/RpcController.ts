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

import { Response as ExpressResponse } from 'express';
import {
    BaseHttpController,
    controller,
    httpPost,
    IHttpActionResult,
    interfaces,
    requestBody,
    response
} from 'inversify-express-utils';
import { inject } from 'inversify';
import { inspect } from 'util';
import { CORE_TASK_EXCHANGE, DOWNLOAD_TASK, JsonResultFactory, RabbitMQService, TYPES } from '@irohalab/mira-shared';
import { getStdLogger } from '../../utils/Logger';

const logger = getStdLogger();

/**
 * This will be deprecated once we deprecate Albireo
 */
@controller('/rpc')
export class RpcController extends BaseHttpController implements interfaces.Controller {

    constructor(@inject(TYPES.RabbitMQService) private _mqService: RabbitMQService) {
        super()
    }

    @httpPost('/download')
    public async sendDownloadMessage(@requestBody() body, @response() res: ExpressResponse): Promise<IHttpActionResult> {
        logger.info('download task: ' + inspect(body));
        try {
            await this._mqService.publish(CORE_TASK_EXCHANGE, DOWNLOAD_TASK, body);
        } catch (error) {
            logger.error('download task message failed to publish: ' + error);
            return JsonResultFactory(500);
        }

        return JsonResultFactory(200);
    }
}