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

import 'reflect-metadata';
import test from 'ava';
import { join } from 'path';
import { RabbitMQService, Sentry } from '@irohalab/mira-shared';
import { DownloadService } from './DownloadService';
import { ConfigManager } from '../utils/ConfigManager';
import { DatabaseService } from './DatabaseService';
import { DownloadAdapter } from '../download-adapter/DownloadAdapter';
import { S3Service } from './S3Service';
import { DownloadJob } from '../entity/DownloadJob';
import { DownloadedObject, reusableDownloadedObjectFilter } from '../entity/DownloadedObject';

test('start', (t) => {

});

test('download', (t) => {

});

test('copyVideoFile', (t) => {

});

test('reusable downloaded objects have at least three hours remaining', (t) => {
	const now = Date.UTC(2026, 6, 26);

	t.deepEqual(reusableDownloadedObjectFilter(now), {
		expiration: { $gt: new Date(now + 3 * 60 * 60 * 1000) },
	});
});

test('downloadComplete stores the local path for S3 objects', async (t) => {
	const savePath = '/downloads/bangumi-id';
	const torrentFile = {
		index: '0',
		name: 'episodes/video.mkv',
		size: 1024,
		progress: 1,
	};
	const expectedLocalPath = join(savePath, torrentFile.name);
	const expectedS3Uri = 's3://downloads/video.mkv';
	let savedObjects: DownloadedObject[] = [];

	const configManager = {
		storageType: () => 'S3' as const,
		s3Bucket: () => ({expireInDays: 3}),
		getFileUrl: () => '',
		applicationId: () => 'download-manager-id',
	} as unknown as ConfigManager;
	const databaseService = {
		getDownloadedObjectRepository: () => ({
			save: async (objects: DownloadedObject[]) => {
				savedObjects = objects;
				return objects;
			},
		}),
	} as unknown as DatabaseService;
	const downloader = {
		getTorrentContent: async () => [torrentFile],
		getTorrentInfo: async () => ({save_path: savePath}),
	} as unknown as DownloadAdapter;
	const s3Service = {
		upload: async (localPath: string) => {
			t.is(localPath, expectedLocalPath);
			return expectedS3Uri;
		},
	} as S3Service;
	const mqService = {
		publish: async () => undefined,
	} as unknown as RabbitMQService;
	const service = new DownloadService(
		configManager,
		databaseService,
		downloader,
		{} as Sentry,
		s3Service,
		mqService,
	);
	const job = new DownloadJob();
	job.downloadedObjects = {
		load: async () => [],
	} as unknown as DownloadJob['downloadedObjects'];
	job.torrentId = 'torrent-id';
	job.bangumiId = 'bangumi-id';
	job.fileMapping = [{episodeNo: '1', filePath: torrentFile.name, videoId: 'video-id'}];

	const beforeDownloadComplete = Date.now();
	await service.downloadComplete(job);

	t.is(savedObjects.length, 1);
	t.is(savedObjects[0].localPath, expectedLocalPath);
	t.is(savedObjects[0].s3Uri, expectedS3Uri);
	t.true(savedObjects[0].expiration.getTime() >= beforeDownloadComplete + 3 * 24 * 60 * 60 * 1000);
});
