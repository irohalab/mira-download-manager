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
import {
	FinishMessageResendPhase,
	FinishMessageResendState,
	FinishMessageResendStatus
} from '../domain/FinishMessageResendState';

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

test('finish message resend reports background completion', async (t) => {
	const job = new DownloadJob();
	const savedStatuses: FinishMessageResendStatus[] = [];
	let findCount = 0;
	let releaseBackgroundFind!: () => void;
	let finishDownloadComplete!: () => void;
	let reportRunning!: () => void;
	let reportSucceeded!: () => void;
	const backgroundFindBlocked = new Promise<void>((resolve) => {
		releaseBackgroundFind = resolve;
	});
	const downloadCompleteBlocked = new Promise<void>((resolve) => {
		finishDownloadComplete = resolve;
	});
	const runningReported = new Promise<void>((resolve) => {
		reportRunning = resolve;
	});
	const succeededReported = new Promise<void>((resolve) => {
		reportSucceeded = resolve;
	});
	const jobRepository = {
		findOne: async () => {
			findCount++;
			if (findCount === 2) {
				await backgroundFindBlocked;
			}
			return job;
		},
		save: async (savedJob: DownloadJob) => {
			const savedState = savedJob.finishMessageResend;
			if (!savedState) {
				throw new Error('finish message resend state was not set');
			}
			savedStatuses.push(savedState.status);
			if (savedState.status === FinishMessageResendStatus.Running) {
				reportRunning();
			}
			if (savedState.status === FinishMessageResendStatus.Succeeded) {
				reportSucceeded();
			}
			return savedJob;
		}
	};
	const databaseService = {
		getJobRepository: () => jobRepository
	} as unknown as DatabaseService;
	const service = new DownloadService(
		{} as ConfigManager,
		databaseService,
		{} as DownloadAdapter,
		{} as Sentry,
		{} as S3Service,
		{} as RabbitMQService
	);
	service.downloadComplete = async () => downloadCompleteBlocked;

	const resendState = await service.startFinishMessageResend(job.id);

	if (!resendState) {
		t.fail('resend state was not returned');
		return;
	}
	t.truthy(resendState.id);
	t.is(resendState.status, FinishMessageResendStatus.Pending);
	t.deepEqual(savedStatuses, [FinishMessageResendStatus.Pending]);

	releaseBackgroundFind();
	await runningReported;
	t.deepEqual(savedStatuses, [
		FinishMessageResendStatus.Pending,
		FinishMessageResendStatus.Running
	]);

	finishDownloadComplete();
	await succeededReported;
	t.deepEqual(savedStatuses, [
		FinishMessageResendStatus.Pending,
		FinishMessageResendStatus.Running,
		FinishMessageResendStatus.Succeeded
	]);
	t.truthy(job.finishMessageResend?.completedAt);
});

test('downloadComplete aggregates progress across uploaded and reusable files', async (t) => {
	const savePath = '/downloads/bangumi-id';
	const torrentFiles = [
		{index: '0', name: 'existing.mkv', size: 100, progress: 1},
		{index: '1', name: 'episode-1.mkv', size: 200, progress: 1},
		{index: '2', name: 'episode-2.mkv', size: 300, progress: 1}
	];
	const existingObject = new DownloadedObject();
	existingObject.localPath = join(savePath, torrentFiles[0].name);
	existingObject.s3Uri = 's3://downloads/existing.mkv';
	const uploadedPaths: string[] = [];
	const savedObjects: DownloadedObject[] = [];
	const progress: Array<{
		phase: FinishMessageResendPhase;
		uploadedBytes: number;
		totalBytes: number;
		percent: number;
	}> = [];
	const configManager = {
		storageType: () => 'S3' as const,
		s3Bucket: () => ({expireInDays: 3}),
		getFileUrl: () => '',
		applicationId: () => 'download-manager-id'
	} as unknown as ConfigManager;
	const databaseService = {
		getDownloadedObjectRepository: () => ({
			save: async (objects: DownloadedObject[]) => {
				savedObjects.push(...objects);
				return objects;
			}
		})
	} as unknown as DatabaseService;
	const downloader = {
		getTorrentContent: async () => torrentFiles,
		getTorrentInfo: async () => ({save_path: savePath})
	} as unknown as DownloadAdapter;
	const s3Service = {
		upload: async (localPath: string, onProgress: (value: {loaded: number, total: number}) => void) => {
			uploadedPaths.push(localPath);
			const file = torrentFiles.find(item => localPath.endsWith(item.name));
			onProgress({loaded: file.size / 2, total: file.size});
			onProgress({loaded: file.size, total: file.size});
			return `s3://downloads/${file.name}`;
		}
	} as unknown as S3Service;
	const mqService = {
		publish: async () => undefined
	} as unknown as RabbitMQService;
	const service = new DownloadService(
		configManager,
		databaseService,
		downloader,
		{} as Sentry,
		s3Service,
		mqService
	);
	const job = new DownloadJob();
	job.downloadedObjects = {
		load: async () => [existingObject]
	} as unknown as DownloadJob['downloadedObjects'];
	job.torrentId = 'torrent-id';
	job.bangumiId = 'bangumi-id';
	job.fileMapping = [{episodeNo: '1', filePath: torrentFiles[1].name, videoId: 'video-id'}];

	await service.downloadComplete(job, value => progress.push(value));

	t.deepEqual(uploadedPaths, [
		join(savePath, torrentFiles[1].name),
		join(savePath, torrentFiles[2].name)
	]);
	t.is(savedObjects.length, 2);
	t.true(progress.some(value => value.phase === FinishMessageResendPhase.Uploading
		&& value.uploadedBytes === 100 && value.totalBytes === 600));
	t.true(progress.some(value => value.phase === FinishMessageResendPhase.Uploading
		&& value.uploadedBytes === 200 && value.percent === 33.33));
	t.true(progress.some(value => value.phase === FinishMessageResendPhase.Uploading
		&& value.uploadedBytes === 450 && value.percent === 75));
	t.deepEqual(progress[progress.length - 1], {
		phase: FinishMessageResendPhase.Publishing,
		uploadedBytes: 600,
		totalBytes: 600,
		percent: 100
	});
});

test('finish message resend persists upload and publishing progress', async (t) => {
	const job = new DownloadJob();
	const savedStates: FinishMessageResendState[] = [];
	let reportSucceeded!: () => void;
	const succeeded = new Promise<void>((resolve) => {
		reportSucceeded = resolve;
	});
	const jobRepository = {
		findOne: async () => job,
		save: async (savedJob: DownloadJob) => {
			if (!savedJob.finishMessageResend) {
				throw new Error('finish message resend state was not set');
			}
			savedStates.push({...savedJob.finishMessageResend});
			if (savedJob.finishMessageResend.status === FinishMessageResendStatus.Succeeded) {
				reportSucceeded();
			}
			return savedJob;
		}
	};
	const databaseService = {
		getJobRepository: () => jobRepository
	} as unknown as DatabaseService;
	const service = new DownloadService(
		{} as ConfigManager,
		databaseService,
		{} as DownloadAdapter,
		{} as Sentry,
		{} as S3Service,
		{} as RabbitMQService
	);
	service.downloadComplete = async (_job, onProgress) => {
		onProgress?.({
			phase: FinishMessageResendPhase.Uploading,
			uploadedBytes: 10,
			totalBytes: 100,
			percent: 10
		});
		onProgress?.({
			phase: FinishMessageResendPhase.Uploading,
			uploadedBytes: 20,
			totalBytes: 100,
			percent: 20
		});
		onProgress?.({
			phase: FinishMessageResendPhase.Publishing,
			uploadedBytes: 100,
			totalBytes: 100,
			percent: 100
		});
	};

	await service.startFinishMessageResend(job.id);
	await succeeded;

	t.true(savedStates.some(state => state.status === FinishMessageResendStatus.Running
		&& state.phase === FinishMessageResendPhase.Preparing));
	t.true(savedStates.some(state => state.status === FinishMessageResendStatus.Running
		&& state.phase === FinishMessageResendPhase.Uploading && state.uploadedBytes === 10));
	t.false(savedStates.some(state => state.phase === FinishMessageResendPhase.Uploading
		&& state.uploadedBytes === 20));
	const finalState = savedStates[savedStates.length - 1];
	t.is(finalState.status, FinishMessageResendStatus.Succeeded);
	t.is(finalState.phase, FinishMessageResendPhase.Publishing);
	t.is(finalState.uploadedBytes, 100);
	t.is(finalState.totalBytes, 100);
	t.is(finalState.percent, 100);
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
