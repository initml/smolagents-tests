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

import { Tool } from './tools';

export const DEFAULT_JSONAGENT_REGEX_GRAMMAR = {
    type: 'regex',
    value: 'Thought: .+?\\nAction:\\n\\{\\n\\s{4}"action":\\s"[^"\\n]+",\\n\\s{4}"action_input":\\s"[^"\\n]+"\\n\\}\\n<end_code>',
};

export const DEFAULT_CODEAGENT_REGEX_GRAMMAR = {
    type: 'regex',
    value: 'Thought: .+?\\nCode:\\n```(?:ts|typescript)?\\n(?:.|\\s)+?\\n```<end_code>',
};

export interface ChatMessageToolCallDefinition {
    arguments: any;
    name: string;
    description?: string;
}

export interface ChatMessageToolCall {
    function: ChatMessageToolCallDefinition;
    id: string;
    type: string;
}

export interface ChatMessage {
    role: string;
    content?: string;
    tool_calls?: ChatMessageToolCall[];
}

export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system',
    TOOL_CALL = 'tool-call',
    TOOL_RESPONSE = 'tool-response',
}

export const toolRoleConversions: Record<MessageRole, MessageRole> = {
    [MessageRole.TOOL_CALL]: MessageRole.ASSISTANT,
    [MessageRole.TOOL_RESPONSE]: MessageRole.USER,
} as const;

export function getJsonSchema(tool: Tool): Record<string, any> {
    const properties = JSON.parse(JSON.stringify(tool.inputs)); // Deep clone
    const required: string[] = [];
    
    for (const [key, value] of Object.entries(properties)) {
        if (value.type === 'any') {
            value.type = 'string';
        }
        if (!('nullable' in value && value.nullable)) {
            required.push(key);
        }
    }
    
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: 'object',
                properties,
                required,
            },
        },
    };
}

export function removeStopSequences(content: string, stopSequences: string[]): string {
    for (const stopSeq of stopSequences) {
        if (content.slice(-stopSeq.length) === stopSeq) {
            content = content.slice(0, -stopSeq.length);
        }
    }
    return content;
}

export function getCleanMessageList(
    messageList: Record<string, string>[],
    roleConversions: Partial<Record<MessageRole, MessageRole>> = {}
): Record<string, string>[] {
    const finalMessageList: Record<string, string>[] = [];
    messageList = JSON.parse(JSON.stringify(messageList)); // Deep clone
    
    for (const message of messageList) {
        const role = message.role;
        if (!Object.values(MessageRole).includes(role as MessageRole)) {
            throw new Error(
                `Incorrect role ${role}, only ${Object.values(MessageRole).join(', ')} are supported for now.`
            );
        }

        if (role in roleConversions) {
            message.role = roleConversions[role as MessageRole]!;
        }

        if (
            finalMessageList.length > 0 &&
            message.role === finalMessageList[finalMessageList.length - 1].role
        ) {
            finalMessageList[finalMessageList.length - 1].content += 
                '\n=======\n' + message.content;
        } else {
            finalMessageList.push(message);
        }
    }
    return finalMessageList;
}

export abstract class Model {
    protected lastInputTokenCount?: number;
    protected lastOutputTokenCount?: number;

    getTokenCounts(): { input?: number; output?: number } {
        return {
            input: this.lastInputTokenCount,
            output: this.lastOutputTokenCount,
        };
    }

    abstract call(
        messages: Record<string, string>[],
        stopSequences?: string[],
        grammar?: string,
        maxTokens?: number,
        toolsToCallFrom?: Tool[]
    ): Promise<string>;
}

// Note: The following classes (HfApiModel, TransformersModel, LiteLLMModel, OpenAIServerModel)
// would need to be implemented differently in TypeScript as they rely heavily on Python-specific
// libraries and functionality. You would need to use appropriate TypeScript/JavaScript alternatives
// for these implementations.
