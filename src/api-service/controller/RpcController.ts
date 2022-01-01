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
import { controller, httpPost, interfaces, requestBody, response } from 'inversify-express-utils';
import { inject } from 'inversify';
import { CORE_TASK_EXCHANGE, DOWNLOAD_TASK, TYPES } from '../../TYPES';
import { ConfigManager } from '../../utils/ConfigManager';
import { DatabaseService } from '../../service/DatabaseService';
import { RabbitMQService } from '../../service/RabbitMQService';
import { inspect } from 'util';
import pino from 'pino';

const logger = pino();

/**
 * This will be deprecated once we deprecate Albireo
 */
@controller('/rpc')
export class RpcController implements interfaces.Controller {

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _database: DatabaseService,
                private _mqService: RabbitMQService) {
    }

    @httpPost('/download')
    public async sendDownloadMessage(@requestBody() body, @response() res: ExpressResponse): Promise<void> {
        logger.info('download task: ' + inspect(body));
        await this._mqService.publish(CORE_TASK_EXCHANGE, DOWNLOAD_TASK, body);
        res.status(200);
    }
}