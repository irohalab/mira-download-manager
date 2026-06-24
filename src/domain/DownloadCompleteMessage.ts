/*
 * Copyright 2026 IROHA LAB
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

import { MQMessage } from '@irohalab/mira-shared';

export interface DownloadCompleteMetadata {
    width?: number;
    height?: number;
    duration?: number;
    dominantColorOfThumbnail?: string;
    thumbnailPath?: string;
    keyframeImagePathList?: string[];
    frameWidth?: number;
    frameHeight?: number;
    tileSize?: number;
}

/**
 * Sent to the streaming platform once a video file is downloaded/processed.
 * Replaces the legacy Albireo `download_complete` HTTP RPC.
 */
export class DownloadCompleteMessage implements MQMessage {
    public id: string;
    public version: string = '1.0';
    public videoId: string;
    public bangumiId: string;
    public filePathList: string[];
    public metadata: DownloadCompleteMetadata | null;
}
