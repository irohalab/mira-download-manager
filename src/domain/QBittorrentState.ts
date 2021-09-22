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

export const QBittorrentState = {
    error: 'error', // Some error occurred, applies to paused torrents
    missingFiles: 'missingFiles', // Torrent data files is missing
    uploading: 'uploading', // Torrent is being seeded and data is being transferred
    pausedUP: 'pausedUP', // Torrent is paused and has finished downloading
    queuedUP: 'queuedUP', // Queuing is enabled and torrent is queued for upload
    stalledUP: 'stalledUP', // Torrent is being seeded, but no connection were made
    checkingUP: 'checkingUP', // Torrent has finished downloading and is being checked
    forcedUP: 'forcedUP', // Torrent is forced to uploading and ignore queue limit
    allocating: 'allocating', // Torrent is allocating disk space for download
    downloading: 'downloading', // Torrent is being downloaded and data is being transferred
    metaDL: 'metaDL', // Torrent has just started downloading and is fetching metadata
    pausedDL: 'pausedDL', // Torrent is paused and has NOT finished downloading
    queuedDL: 'queuedDL', // Queuing is enabled and torrent is queued for download
    stalledDL: 'stalledDL', // Torrent is being downloaded, but no connection were made
    checkingDL: 'checkingDL', // Same as checkingUP, but torrent has NOT finished downloading
    forcedDL: 'forcedDL', // Torrent is forced to downloading to ignore queue limit
    checkingResumeData: 'checkingResumeData', // Checking resume data on qBt startup
    moving: 'moving', // Torrent is moving to another location
    unknown: 'unknown', // Unknown status
}