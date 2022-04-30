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

import { load as loadYaml } from 'js-yaml';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { injectable } from 'inversify';
import { QBittorrentConfig } from '../domain/QBittorrentConfig';
import { Options } from 'amqplib';
import * as os from 'os';
import { ConfigManager } from './ConfigManager';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { MikroORMOptions } from '@mikro-orm/core/utils/Configuration';
import { MiraNamingStrategy } from '@irohalab/mira-shared';
import { AbstractNamingStrategy, EntityCaseNamingStrategy } from '@mikro-orm/core';
import { NamingStrategy } from '@mikro-orm/core/naming-strategy';

type OrmConfig = {
    type: string;
    host: string;
    port: number;
    user: string;
    password: string;
    dbName: string;
    entities: string[];
    entitiesTs: string[];
};

type AppConfig = {
    amqp: {
        host: string;
        port: number;
        user: string;
        password: string;
    }
    amqpUrl: string;
    downloader: string;
    download_location: string;
    download_manager_id: string;
    deluge: {
        json_rpc_url: string;
        password: string;
    }
    qBittorrent: QBittorrentConfig;
    webserver: {
        enableHttps: boolean;
        host: string;
        port: number;
    }
    appIdHostMap: { [appId: string]: string};
    albireoRPC: string;
};

const CWD_PATTERN = /\${cwd}/;
const HOME_PATTERN = /\${home}/;
const PROJECT_ROOT_PATTERN = /\${project_root}/;

@injectable()
export class ConfigManagerImpl implements ConfigManager {
    private readonly _ormConfig: OrmConfig;
    private readonly _config: AppConfig;

    constructor() {
        const ormConfigPath = process.env.ORMCONFIG || resolve(__dirname, '../../ormconfig.json');
        const appConfigPath = process.env.APPCONFIG || resolve(__dirname, '../../config.yml');
        this._config = loadYaml(readFileSync(appConfigPath, { encoding: 'utf-8'})) as AppConfig;
        this._ormConfig = JSON.parse(readFileSync(ormConfigPath, {encoding: 'utf-8'}));
        this.verifyConfig();
    }

    public downloader(): string {
        return this._config.downloader;
    }

    public delugeRPCUrl(): string {
        return this._config.deluge.json_rpc_url;
    }

    public delugePass(): string {
        return this._config.deluge.password;
    }

    public defaultDownloadLocation(): string {
        return ConfigManagerImpl.processPath(this._config.download_location);
    }

    public getQBittorrentConfig(): QBittorrentConfig {
        return this._config.qBittorrent;
    }

    public databaseConfig(): MikroORMOptions<PostgreSqlDriver> {
        return Object.assign({namingStrategy: MiraNamingStrategy as {new(): NamingStrategy}}, this._ormConfig) as MikroORMOptions<PostgreSqlDriver>;
    }

    public amqpServerUrl(): string {
        let amqpUrl = process.env.AMQP_URL;
        if (!amqpUrl) {
            amqpUrl = this._config.amqpUrl;
        }
        return amqpUrl;
    }

    public amqpConfig(): Options.Connect {
        const host = this._config.amqp.host || 'localhost';
        const port = this._config.amqp.port || 5672;
        const username = this._config.amqp.user || 'guest';
        const password = this._config.amqp.password || 'guest';
        return {
            protocol: 'amqp',
            hostname: host,
            port,
            username,
            password,
            locale: 'en_US',
            frameMax: 0,
            heartbeat: 0,
            vhost: '/'
        }
    }
    public enabledHttps(): boolean {
        return this._config.webserver.enableHttps || false;
    }
    public serverHost(): string {
        return this._config.webserver.host || 'localhost';
    }
    public serverPort(): number {
        return this._config.webserver.port || 8080;
    }
    public getFileUrl(relativeFilePath: string, downloadJobId: string): string {
        const serverBaseUrl = process.env.SERVER_BASE_URL;
        relativeFilePath = encodeURIComponent(relativeFilePath);
        if (serverBaseUrl) {
            return `${serverBaseUrl}/file/content/${downloadJobId}?relativeFilePath=${relativeFilePath}`;
        }
        return `${this.enabledHttps() ? 'https' : 'http'}://${this.serverHost()}:${this.serverPort()}/file/content/${downloadJobId}?relativeFilePath=${relativeFilePath}`;
    }

    public applicationId(): string {
        return this._config.download_manager_id;
    }

    public appIdHostMap(): { [p: string]: string } {
        return this._config.appIdHostMap || {};
    }

    public albireoRPCUrl(): string {
        return this._config.albireoRPC;
    }

    private static processPath(pathStr: string): string {
        const cwd = process.cwd();
        const home = os.homedir();
        const projectRoot = resolve(__dirname, '../../');
        return pathStr.replace(CWD_PATTERN, cwd).replace(HOME_PATTERN, home).replace(PROJECT_ROOT_PATTERN, projectRoot);
    }

    private verifyConfig(): void {
        if (!this._config.download_manager_id) {
            throw new Error('download_manager_id is not set');
        }
        if (!this._config.downloader) {
            throw new Error('downloader is not set');
        }
    }
}