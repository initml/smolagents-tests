/**
 * Copyright 2024 HuggingFace Inc.
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

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Abstract class to be implemented to define types that can be returned by agents.
 */
export abstract class AgentType<T> {
    protected _value: T;

    constructor(value: T) {
        this._value = value;
    }

    abstract toRaw(): T;
    abstract toString(): string;
}

/**
 * Text type returned by the agent.
 */
export class AgentText extends AgentType<string> {
    constructor(value: string) {
        super(value);
    }

    toRaw(): string {
        return this._value;
    }

    toString(): string {
        return this._value;
    }
}

/**
 * Image type returned by the agent.
 */
export class AgentImage extends AgentType<Buffer | string> {
    private _path: string | null = null;
    private _raw: Buffer | null = null;

    constructor(value: Buffer | string) {
        super(value);
        
        if (value instanceof Buffer) {
            this._raw = value;
        } else if (typeof value === 'string') {
            this._path = value;
        } else {
            throw new TypeError(`Unsupported type for AgentImage: ${typeof value}`);
        }
    }

    toRaw(): Buffer {
        if (this._raw) {
            return this._raw;
        }

        if (this._path) {
            return fs.readFileSync(this._path);
        }

        throw new Error('No valid image data available');
    }

    toString(): string {
        if (this._path) {
            return this._path;
        }

        if (this._raw) {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-image-'));
            this._path = path.join(directory, `${uuidv4()}.png`);
            fs.writeFileSync(this._path, this._raw);
            return this._path;
        }

        throw new Error('No valid image data available');
    }

    save(outputPath: string): void {
        fs.writeFileSync(outputPath, this.toRaw());
    }
}

/**
 * Audio type returned by the agent.
 */
export class AgentAudio extends AgentType<Buffer | string> {
    private _path: string | null = null;
    private _raw: Buffer | null = null;
    private _samplerate: number;

    constructor(value: Buffer | string, samplerate: number = 16000) {
        super(value);
        this._samplerate = samplerate;

        if (value instanceof Buffer) {
            this._raw = value;
        } else if (typeof value === 'string') {
            this._path = value;
        } else {
            throw new TypeError(`Unsupported type for AgentAudio: ${typeof value}`);
        }
    }

    toRaw(): Buffer {
        if (this._raw) {
            return this._raw;
        }

        if (this._path) {
            return fs.readFileSync(this._path);
        }

        throw new Error('No valid audio data available');
    }

    toString(): string {
        if (this._path) {
            return this._path;
        }

        if (this._raw) {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-audio-'));
            this._path = path.join(directory, `${uuidv4()}.wav`);
            fs.writeFileSync(this._path, this._raw);
            return this._path;
        }

        throw new Error('No valid audio data available');
    }

    get samplerate(): number {
        return this._samplerate;
    }
}

export const AGENT_TYPE_MAPPING = {
    string: AgentText,
    image: AgentImage,
    audio: AgentAudio
} as const;

export function handleAgentInputTypes<T>(value: T): AgentType<unknown> {
    if (typeof value === 'string') {
        return new AgentText(value);
    }
    if (value instanceof Buffer) {
        // You might want to add more sophisticated detection here
        return new AgentImage(value);
    }
    throw new TypeError(`Unsupported input type: ${typeof value}`);
}

export function handleAgentOutputTypes(
    output: unknown,
    outputType?: keyof typeof AGENT_TYPE_MAPPING
): AgentType<unknown> {
    if (output instanceof AgentType) {
        return output;
    }
    if (outputType && outputType in AGENT_TYPE_MAPPING) {
        return new AGENT_TYPE_MAPPING[outputType](output);
    }
    return handleAgentInputTypes(output);
}
