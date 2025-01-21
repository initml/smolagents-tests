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
import { evaluateJavaScriptCode } from './local_js_executor';
import { BASE_JS_TOOLS } from './local_js_executor';
import { AuthorizedType } from './tools';
import fetch from 'node-fetch';
import * as readline from 'readline';

interface PreTool {
    name: string;
    inputs: Record<string, any>;
    outputType: AuthorizedType;
    task: string;
    description: string;
    repoId: string;
}


export class JavaScriptInterpreterTool extends Tool {
    name = 'javascript_interpreter';
    description = 'This is a tool that evaluates JavaScript code. It can be used to perform calculations.';
    inputs = {
        code: {
            type: 'string' as const,
            description: 'The JavaScript code to run in interpreter',
        },
    };
    outputType = 'string' as const;

    private baseJsTools: typeof BASE_JS_TOOLS;
    private jsEvaluator: typeof evaluateJavaScriptCode;

    constructor() {
        super();
        this.baseJsTools = BASE_JS_TOOLS;
        this.jsEvaluator = evaluateJavaScriptCode;
    }

    async forward(code: string): Promise<string> {
        const state: { printOutputs: string[] } = { printOutputs: [] };
        const [output] = await this.jsEvaluator(code, state, this.baseJsTools);
        return `Stdout:\n${state.printOutputs.join('\n')}\nOutput: ${String(output)}`;
    }
}

export class FinalAnswerTool extends Tool {
    name = 'finalAnswer';
    description = 'Provides a final answer to the given problem.';
    inputs = {
        answer: {
            type: 'string' as const,
            description: 'The final answer to the problem',
            nullable: false
        },
    };
    outputType = 'string' as const;

    async forward(answer: any): Promise<string> {
        return typeof answer === 'string' ? answer : JSON.stringify(answer);
    }
}

export class UserInputTool extends Tool {
    name = 'userInput';
    description = "Asks for user's input on a specific question";
    inputs = {
        question: {
            type: 'string' as const,
            description: 'The question to ask the user',
        },
    };
    outputType = 'string' as const;

    async forward(question: string): Promise<string> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question(`${question} => `, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }
}

export class DuckDuckGoSearchTool extends Tool {
    name = 'webSearch';
    description = 'Performs a duckduckgo web search based on your query (think a Google search) then returns the top search results.';
    inputs = {
        query: {
            type: 'string' as const,
            description: 'The search query to perform.',
        },
    };
    outputType = 'string' as const;

    private maxResults: number;

    constructor(maxResults = 10) {
        super();
        this.maxResults = maxResults;
    }

    async forward(query: string): Promise<string> {
        try {
            const response = await fetch(
                `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
            );
            if (!response.ok) {
                throw new Error('Failed to fetch search results');
            }

            const data = await response.json();
            const results = data.RelatedTopics.slice(0, this.maxResults);
            const postprocessedResults = results.map(
                (result: any) => `[${result.Text}](${result.FirstURL})`
            );

            return '## Search Results\n\n' + postprocessedResults.join('\n\n');
        } catch (error) {
            throw new Error(`Search failed: ${error}`);
        }
    }
}

export class VisitWebpageTool extends Tool {
    name = 'visitWebpage';
    description = 'Visits a webpage at the given url and reads its content as a markdown string. Use this to browse webpages.';
    inputs = {
        url: {
            type: 'string' as const,
            description: 'The url of the webpage to visit.',
        },
    };
    outputType = 'string' as const;

    async forward(url: string): Promise<string> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch webpage: ${response.statusText}`);
            }
            const html = await response.text();
            
            // Basic HTML to Markdown conversion
            // In a real implementation, you'd want to use a proper HTML to Markdown converter
            return html
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
        } catch (error) {
            throw new Error(`Failed to visit webpage: ${error}`);
        }
    }
}

export const TOOL_MAPPING: Record<string, typeof Tool> = {
    javascriptInterpreter: JavaScriptInterpreterTool,
    finalAnswer: FinalAnswerTool,
    userInput: UserInputTool,
    webSearch: DuckDuckGoSearchTool,
    visitWebpage: VisitWebpageTool,
};
