/*
 * Copyright 2025 IROHA LAB
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

import { DownloadJob } from './DownloadJob';
import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';
import { randomUUID } from 'crypto';

@Entity()
export class DownloadedObject {
    @PrimaryKey()
    public id: string = randomUUID();

    @Property()
    public name: string;

    @Property()
    public localPath: string;

    @Property()
    public s3Uri: string;

    @Property()
    public expiration?: Date;

    @ManyToOne(() => DownloadJob)
    public downloadJob: DownloadJob;
}