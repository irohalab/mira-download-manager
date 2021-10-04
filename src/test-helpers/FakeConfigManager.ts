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

import { ConfigManager } from '../utils/ConfigManager';
import { injectable } from 'inversify';
import { ConnectionOptions } from 'typeorm';
import { QBittorrentConfig } from '../domain/QBittorrentConfig';
import { Options } from 'amqplib';

@injectable()
export class FakeConfigManager implements ConfigManager {
    public albireoRPCUrl(): string {
        return '';
    }

    public amqpConfig(): Options.Connect {
        return undefined;
    }

    public appIdHostMap(): { [p: string]: string } {
        return {};
    }

    public applicationId(): string {
        return '';
    }

    public databaseConnectionConfig(): ConnectionOptions {
        return undefined;
    }

    public defaultDownloadLocation(): string {
        return '';
    }

    public delugePass(): string {
        return '';
    }

    public delugeRPCUrl(): string {
        return '';
    }

    public downloader(): string {
        return '';
    }

    public enabledHttps(): boolean {
        return false;
    }

    public getFileUrl(relativeFilePath: string, downloadJobId: string): string {
        return '';
    }

    public getQBittorrentConfig(): QBittorrentConfig {
        return undefined;
    }

    public serverHost(): string {
        return '';
    }

    public serverPort(): number {
        return 0;
    }

}