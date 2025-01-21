/**
 * Copyright 2024 The HuggingFace Inc. team. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

interface Logger {
    log(message: string, level: number): void;
}

interface StepLog {
    duration: number;
}

interface TrackedModel {
    lastInputTokenCount?: number;
    lastOutputTokenCount?: number;
}

export class Monitor {
    private stepDurations: number[] = [];
    private totalInputTokenCount: number = 0;
    private totalOutputTokenCount: number = 0;
    private trackedModel: TrackedModel;
    private logger: Logger;

    constructor(trackedModel: TrackedModel, logger: Logger) {
        this.trackedModel = trackedModel;
        this.logger = logger;
    }

    public getTotalTokenCounts(): { input: number; output: number } {
        return {
            input: this.totalInputTokenCount,
            output: this.totalOutputTokenCount,
        };
    }

    public reset(): void {
        this.stepDurations = [];
        this.totalInputTokenCount = 0;
        this.totalOutputTokenCount = 0;
    }

    public updateMetrics(stepLog: StepLog): void {
        const stepDuration = stepLog.duration;
        this.stepDurations.push(stepDuration);
        
        let consoleOutputs = `[Step ${this.stepDurations.length - 1}: Duration ${stepDuration.toFixed(2)} seconds`;

        if (this.trackedModel.lastInputTokenCount !== undefined) {
            this.totalInputTokenCount += this.trackedModel.lastInputTokenCount;
            this.totalOutputTokenCount += this.trackedModel.lastOutputTokenCount!;
            consoleOutputs += ` | Input tokens: ${this.totalInputTokenCount.toLocaleString()} | Output tokens: ${this.totalOutputTokenCount.toLocaleString()}`;
        }
        
        consoleOutputs += ']';
        this.logger.log(consoleOutputs, 1);
    }
}
