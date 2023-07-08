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

import { DownloaderType } from '../domain/DownloaderType';
import { JobStatus } from '../domain/JobStatus';
import { DownloadTaskMessage } from '../domain/DownloadTaskMessage';
import {
    BigIntType,
    DateTimeType,
    Entity,
    EntityRepositoryType,
    Enum, FloatType, IntegerType,
    JsonType,
    PrimaryKey,
    Property
} from '@mikro-orm/core';
import { DownloadJobRepository } from '../repository/DownloadJobRepository';
import { randomUUID } from 'crypto';
import { FileMapping } from '@irohalab/mira-shared/domain/FileMapping';

@Entity({ customRepository: () => DownloadJobRepository })
export class DownloadJob {
    @PrimaryKey()
    public id: string = randomUUID();

    @Property({
        nullable: true
    })
    public torrentId: string;

    @Enum(() => DownloaderType)
    public downloader: DownloaderType = DownloaderType.qBittorrent;

    @Enum(() => JobStatus)
    public status: JobStatus = JobStatus.Pending;

    @Property({
        columnType: 'text'
    })
    public torrentUrl: string;

    @Property()
    public bangumiId: string;

    @Property()
    public downloadTaskMessageId: string;

    @Property({
        columnType: 'jsonb',
        type: JsonType
    })
    public downloadTaskMessage: DownloadTaskMessage;

    @Property({
        columnType: 'jsonb',
        type: JsonType,
        nullable: true
    })
    public fileMapping: FileMapping[];

    @Property({
        nullable: true
    })
    public videoId: string;

    @Property({
        columnType: 'text',
        nullable: true
    })
    public torrentName: string;

    @Property({
        type: FloatType,
        default: 0
    })
    public progress: number;

    @Property({
        type: FloatType,
        default: 0
    })
    public downloadSpeed: number;

    @Property({
        type: FloatType,
        default: 0
    })
    public eta: number;

    @Property({
        type: FloatType,
        default: 0,
        nullable: true
    })
    public availability?: number;

    @Property({
        type: IntegerType,
        default: 0
    })
    public priority: number;

    @Property({
        type: BigIntType,
        default: 0
    })
    public size: number;

    @Property({
        type: BigIntType,
        default: 0
    })
    public downloaded: number;

    @Property({
        type: BigIntType,
        default: 0
    })
    public amountLeft: number;

    @Property({
        type: IntegerType,
        default: 0
    })
    public activeTime: number;

    @Property({
        type: IntegerType,
        default: 0
    })
    public seeds: number;

    @Property({
        type: IntegerType,
        default: 0
    })
    public leechers: number;

    @Property({
        type: IntegerType,
        default: 0
    })
    public connectedSeeds: number;

    @Property({
        type: IntegerType,
        default: 0
    })
    public connectedLeechers: number;

    @Property({
        columnType: 'timestamp',
        type: DateTimeType,
        nullable: true
    })
    public createTime: Date;

    // there may be delay between job endTime and the torrent endTime
    @Property({
        columnType: 'timestamp',
        type: DateTimeType,
        nullable: true
    })
    public endTime: Date;

    @Property({
        columnType: 'jsonb',
        type: JsonType,
        nullable: true
    })
    public errorInfo: { message?: string, stack?: string };

    [EntityRepositoryType]?: DownloadJobRepository;
}