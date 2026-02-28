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

import { DatabaseService } from '../service/DatabaseService';
import { injectable } from 'inversify';
import { DownloadJobRepository } from '../repository/DownloadJobRepository';
import { CleanUpTaskRepository } from '../repository/CleanUpTaskRepository';
import { Request, Response, NextFunction } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { DownloadedObjectsRepository } from '../repository/DownloadedObjectsRepository';

@injectable()
export class FakeDatabaseService implements DatabaseService {
    getDownloadedObjectRepository(): DownloadedObjectsRepository {
        throw new Error('Method not implemented.');
    }
    initSchema(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    generateSchema(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    syncSchema(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    requestContextMiddleware(): (req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>, res: Response<any, Record<string, any>>, next: NextFunction) => void {
        throw new Error('Method not implemented.');
    }
    public getJobRepository(): DownloadJobRepository {
        return undefined;
    }

    public start(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public stop(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public getCleanUpTaskRepository(): CleanUpTaskRepository {
        return undefined;
    }

}