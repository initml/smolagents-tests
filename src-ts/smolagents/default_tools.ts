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
import { AuthorizedType } from './tools';
import fetch from 'node-fetch';
import * as readline from 'readline';
import { LogLevel, AgentLogger } from './logger';

const LOG_LEVEL = LogLevel.DEBUG;  // Set default log level for this file

interface PreTool {
    name: string;
    inputs: Record<string, any>;
    outputType: AuthorizedType;
    task: string;
    description: string;
    repoId: string;
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
    protected logger: AgentLogger;

    constructor() {
        super();
        this.logger = AgentLogger.getInstance({ source: 'FinalAnswer', level: LOG_LEVEL });
    }

    async forward(answer: any): Promise<string> {
        const result = typeof answer === 'string' ? answer : JSON.stringify(answer);
        this.logger.log(`Final answer provided: ${result}`, { level: LogLevel.INFO });
        return result;
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
    protected logger: AgentLogger;

    constructor() {
        super();
        this.logger = AgentLogger.getInstance({ source: 'UserInput', level: LOG_LEVEL });
    }

    async forward(question: string): Promise<string> {
        this.logger.log(`Requesting user input: ${question}`, { level: LogLevel.INFO });
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question(`${question} => `, (answer) => {
                rl.close();
                this.logger.log(`Received user input: ${answer}`, { level: LogLevel.DEBUG });
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
    protected logger: AgentLogger;

    private maxResults: number;

    constructor(maxResults = 10) {
        super();
        this.maxResults = maxResults;
        this.logger = AgentLogger.getInstance({ source: 'DuckDuckGoSearch', level: LOG_LEVEL });
    }

    async forward(query: string): Promise<string> {
        this.logger.log(`Performing web search for query: ${query}`, { level: LogLevel.INFO });
        
        try {
            const response = await fetch(
                `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
            );
            if (!response.ok) {
                const error = `Failed to fetch search results: ${response.statusText}`;
                this.logger.log(error, { level: LogLevel.ERROR });
                throw new Error(error);
            }

            const data = await response.json();
            const results = data.RelatedTopics.slice(0, this.maxResults);
            const postprocessedResults = results.map(
                (result: any) => `[${result.Text}](${result.FirstURL})`
            );

            const formattedResults = '## Search Results\n\n' + postprocessedResults.join('\n\n');
            this.logger.log(`Found ${results.length} search results`, { level: LogLevel.DEBUG });
            return formattedResults;
        } catch (error) {
            const errorMsg = `Search failed: ${error}`;
            this.logger.log(errorMsg, { level: LogLevel.ERROR });
            throw new Error(errorMsg);
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
    protected logger: AgentLogger;

    constructor() {
        super();
        this.logger = AgentLogger.getInstance({ source: 'VisitWebpage', level: LOG_LEVEL });
    }

    async forward(url: string): Promise<string> {
        this.logger.log(`Visiting webpage: ${url}`, { level: LogLevel.INFO });
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const error = `Failed to fetch webpage: ${response.statusText}`;
                this.logger.log(error, { level: LogLevel.ERROR });
                throw new Error(error);
            }
            const html = await response.text();
            this.logger.log(`Successfully fetched webpage content (${html.length} bytes)`, { level: LogLevel.DEBUG });
            
            // Basic HTML to Markdown conversion
            // In a real implementation, you'd want to use a proper HTML to Markdown converter
            const markdown = html
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
            
            this.logger.log(`Converted HTML to markdown (${markdown.length} characters)`, { level: LogLevel.DEBUG });
            return markdown;
        } catch (error) {
            const errorMsg = `Failed to visit webpage: ${error}`;
            this.logger.log(errorMsg, { level: LogLevel.ERROR });
            throw new Error(errorMsg);
        }
    }
}

export const TOOL_MAPPING: Record<string, new () => Tool> = {
    finalAnswer: FinalAnswerTool,
    userInput: UserInputTool,
    webSearch: DuckDuckGoSearchTool,
    visitWebpage: VisitWebpageTool,
};
