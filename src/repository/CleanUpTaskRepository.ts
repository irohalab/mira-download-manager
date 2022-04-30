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

import { CleanUpTask } from '../entity/CleanUpTask';
import { BaseEntityRepository } from '@irohalab/mira-shared/repository/BaseEntityRepository';

export class CleanUpTaskRepository extends BaseEntityRepository<CleanUpTask> {
    public async addTempFolderPath(tempFolderPath: string): Promise<void> {
        const task = new CleanUpTask();
        task.directoryPath = tempFolderPath;
        await this.persist(task);
    }
}