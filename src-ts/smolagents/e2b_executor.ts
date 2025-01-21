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

import { config } from 'dotenv';
import { Sandbox } from '@e2b/sdk';
import { Tool } from './tools';
import { validateToolAttributes } from './tool_validation';
import { instanceToSource } from './utils';

config();

interface Logger {
    log(message: string, level?: number): void;
}

interface ExecutionResult {
    error?: {
        name: string;
        value: string;
        traceback: string;
    };
    logs: {
        stdout: string[];
    };
    results?: Array<{
        isMainResult: boolean;
        jpeg?: string;
        png?: string;
        chart?: string;
        data?: any;
        html?: string;
        javascript?: string;
        json?: string;
        latex?: string;
        markdown?: string;
        pdf?: string;
        svg?: string;
        text?: string;
    }>;
}

export class E2BExecutor {
    private customTools: Record<string, any> = {};
    private sbx: Sandbox;
    private logger: Logger;

    constructor(additionalImports: string[], tools: Tool[], logger: Logger) {
        this.logger = logger;
        this.sbx = new Sandbox();

        // Install additional dependencies
        if (additionalImports.length > 0) {
            this.installDependencies(additionalImports);
        }

        // Initialize tools
        this.initializeTools(tools);
    }

    private async installDependencies(imports: string[]): Promise<void> {
        try {
            const execution = await this.sbx.commands.run(
                `npm install ${imports.join(' ')}`
            );
            if (execution.error) {
                throw new Error(`Error installing dependencies: ${execution.error}`);
            }
            this.logger.log(`Installation of ${imports} succeeded!`, 0);
        } catch (error) {
            throw new Error(`Failed to install dependencies: ${error}`);
        }
    }

    private async initializeTools(tools: Tool[]): Promise<void> {
        const toolCodes: string[] = [];

        for (const tool of tools) {
            validateToolAttributes(tool.constructor);
            const toolCode = instanceToSource(tool, Tool);
            toolCodes.push(toolCode);
        }

        const toolDefinitionCode = `
            class Tool {
                call(...args: any[]): any {
                    return this.forward(...args);
                }

                forward(...args: any[]): any {
                    // To be implemented in child class
                }
            }

            ${toolCodes.join('\n\n')}
        `;

        const execution = await this.runCodeRaiseErrors(toolDefinitionCode);
        this.logger.log(execution.logs.stdout.join('\n'));
    }

    private async runCodeRaiseErrors(code: string): Promise<ExecutionResult> {
        const execution = await this.sbx.runCode(code);
        
        if (execution.error) {
            const executionLogs = execution.logs.stdout.join('\n');
            const errorMessage = [
                executionLogs,
                'Executing code yielded an error:',
                execution.error.name,
                execution.error.value,
                execution.error.traceback,
            ].join('\n');
            
            throw new Error(errorMessage);
        }
        
        return execution;
    }

    async call(
        codeAction: string,
        additionalArgs: Record<string, any>
    ): Promise<[any, string]> {
        if (Object.keys(additionalArgs).length > 0) {
            // Pass additional args to the sandbox
            const serializedArgs = JSON.stringify(additionalArgs);
            const remoteLoadingCode = `
                const args = JSON.parse('${serializedArgs}');
                Object.assign(globalThis, args);
            `;
            const execution = await this.runCodeRaiseErrors(remoteLoadingCode);
            this.logger.log(execution.logs.stdout.join('\n'), 1);
        }

        const execution = await this.runCodeRaiseErrors(codeAction);
        const executionLogs = execution.logs.stdout.join('\n');

        if (!execution.results || execution.results.length === 0) {
            return [null, executionLogs];
        }

        for (const result of execution.results) {
            if (result.isMainResult) {
                // Handle image outputs
                if (result.jpeg || result.png) {
                    const imageData = result.jpeg || result.png;
                    return [Buffer.from(imageData, 'base64'), executionLogs];
                }

                // Handle other output types
                const outputTypes = [
                    'chart',
                    'data',
                    'html',
                    'javascript',
                    'json',
                    'latex',
                    'markdown',
                    'pdf',
                    'svg',
                    'text',
                ];

                for (const type of outputTypes) {
                    if (result[type] !== undefined) {
                        return [result[type], executionLogs];
                    }
                }
            }
        }

        throw new Error('No main result returned by executor!');
    }
}
