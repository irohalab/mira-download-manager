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

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DownloaderType } from '../domain/DownloaderType';
import { JobStatus } from '../domain/JobStatus';
import { DownloadTaskMessage } from '../domain/DownloadTaskMessage';
import { FileMapping } from '../domain/FileMapping';

@Entity()
export class DownloadJob {
    @PrimaryGeneratedColumn('uuid')
    public id: string;

    @Column({
        nullable: true
    })
    public torrentId: string;

    @Column({
        type: 'enum',
        enum: DownloaderType,
        default: DownloaderType.qBittorrent
    })
    public downloader: DownloaderType;

    @Column({
        type: 'enum',
        enum: JobStatus,
        default: JobStatus.Pending
    })
    public status: JobStatus

    @Column()
    public torrentUrl: string;

    @Column()
    public bangumiId: string;

    @Column()
    public downloadTaskMessageId: string;

    @Column({
        type: 'jsonb'
    })
    public downloadTaskMessage: DownloadTaskMessage;

    @Column({
        type: 'jsonb',
        nullable: true
    })
    public fileMapping: FileMapping[];

    @Column({
        nullable: true
    })
    public videoId: string;

    @Column({
        type: 'float',
        default: 0
    })
    public progress: number;

    @Column({
        type: 'timestamp',
        nullable: true
    })
    public createTime: Date;

    // there may be delay between job endTime and the torrent endTime
    @Column({
        type: 'timestamp',
        nullable: true
    })
    public endTime: Date;
}