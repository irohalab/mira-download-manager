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

export interface QBittorrentInfo {
    added_on: number // integer	Time (Unix Epoch) when the torrent was added to the client
    amount_left: number // integer	Amount of data left to download (bytes)
    auto_tmm: boolean // bool	Whether this torrent is managed by Automatic Torrent Management
    availability: number // float	Percentage of file pieces currently available
    category: string // string	Category of the torrent
    completed: number // integer	Amount of transfer data completed (bytes)
    completion_on: number // integer	Time (Unix Epoch) when the torrent completed
    content_path: string // string	Absolute path of torrent content (root path for multifile torrents, absolute file path for singlefile torrents)
    dl_limit: number // integer	Torrent download speed limit (bytes/s). -1 if ulimited.
    dlspeed: number // integer	Torrent download speed (bytes/s)
    downloaded: number // integer	Amount of data downloaded
    downloaded_session: number // integer	Amount of data downloaded this session
    eta: number // integer	Torrent ETA (seconds)
    f_l_piece_prio: boolean // bool	True if first last piece are prioritized
    force_start: boolean // bool	True if force start is enabled for this torrent
    hash: string // string	Torrent hash
    last_activity: number // integer	Last time (Unix Epoch) when a chunk was downloaded/uploaded
    magnet_uri: string // string	Magnet URI corresponding to this torrent
    max_ratio: number // float	Maximum share ratio until torrent is stopped from seeding/uploading
    max_seeding_time: number // integer	Maximum seeding time (seconds) until torrent is stopped from seeding
    name: string // string	Torrent name
    num_complete: number // integer	Number of seeds in the swarm
    num_incomplete: number // integer	Number of leechers in the swarm
    num_leechs: number // integer	Number of leechers connected to
    num_seeds: number // integer	Number of seeds connected to
    priority: number // integer	Torrent priority. Returns -1 if queuing is disabled or torrent is in seed mode
    progress: number // float	Torrent progress (percentage/100)
    ratio: number // float	Torrent share ratio. Max ratio value: 9999.
    ratio_limit: number // float	TODO (what is different from max_ratio?)
    save_path: string // string	Path where this torrent's data is stored
    seeding_time: number // integer	Torrent elapsed time while complete (seconds)
    seeding_time_limit: number // integer	TODO (what is different from max_seeding_time?) seeding_time_limit is a per torrent setting, when Automatic Torrent Management is disabled, furthermore then max_seeding_time is set to seeding_time_limit for this torrent. If Automatic Torrent Management is enabled, the value is -2. And if max_seeding_time is unset it have a default value -1.
    seen_complete: number // integer	Time (Unix Epoch) when this torrent was last seen complete
    seq_dl: boolean // bool	True if sequential download is enabled
    size: number // integer	Total size (bytes) of files selected for download
    state: string // string	Torrent state. See table here below for the possible values
    super_seeding: boolean // bool	True if super seeding is enabled
    tags: string // string	Comma-concatenated tag list of the torrent
    time_active: number // integer	Total active time (seconds)
    total_size: number // integer	Total size (bytes) of all file in this torrent (including unselected ones)
    tracker: string // string	The first tracker with working status. Returns empty string if no tracker is working.
    up_limit: number // integer	Torrent upload speed limit (bytes/s). -1 if ulimited.
    uploaded: number // integer	Amount of data uploaded
    uploaded_session: number // integer	Amount of data uploaded this session
    upspeed: number // integer	Torrent upload speed (bytes/s)
}