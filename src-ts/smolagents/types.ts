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

export const AGENT_TYPE_MAPPING = {
    string: AgentText
} as const;

export function handleAgentInputTypes<T>(value: T): AgentType<unknown> {
    if (typeof value === 'string') {
        return new AgentText(value);
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
        if (typeof output !== 'string') {
            throw new TypeError(`Output must be a string for type '${outputType}'`);
        }
        return new AGENT_TYPE_MAPPING[outputType](output);
    }
    return handleAgentInputTypes(output);
}
