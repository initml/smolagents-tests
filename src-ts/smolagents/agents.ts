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
import { FinalAnswerTool, TOOL_MAPPING } from './default_tools';
import { MessageRole, ChatMessage } from './models';
import { 
    CODE_SYSTEM_PROMPT,
    MANAGED_AGENT_PROMPT,
    PLAN_UPDATE_FINAL_PLAN_REDACTION,
    SYSTEM_PROMPT_PLAN,
    SYSTEM_PROMPT_PLAN_UPDATE,
    TOOL_CALLING_SYSTEM_PROMPT,
    USER_PROMPT_PLAN,
    USER_PROMPT_PLAN_UPDATE,
} from './prompts';
import { 
    DEFAULT_TOOL_DESCRIPTION_TEMPLATE,
    getToolDescriptionWithArgs
} from './tools';
import {
    AgentError,
    AgentExecutionError,
    AgentGenerationError,
    AgentMaxStepsError,
    AgentParsingError,
    parseCodeBlobs,
    parseJsonToolCall,
    truncateContent,
} from './utils';
import { FactsManager } from './facts';

export interface ToolCall {
    name: string;
    arguments: any;
    id?: string;
}

export interface AgentStepLog {
    agentMemory?: ChatMessage[];
    toolCalls?: ToolCall[];
    startTime?: number;
    endTime?: number;
    step?: number;
    error?: AgentError;
    duration?: number;
    llmOutput?: string;
    observations?: string;
    actionOutput?: any;
}

export class ActionStep implements AgentStepLog {
    agentMemory?: ChatMessage[];
    toolCalls?: ToolCall[];
    startTime?: number;
    endTime?: number;
    step?: number;
    error?: AgentError;
    duration?: number;
    llmOutput?: string;
    observations?: string;
    actionOutput?: any;

    constructor(init?: Partial<ActionStep>) {
        Object.assign(this, init);
    }
}

export class PlanningStep {
    constructor(public plan: string, public facts: string) {}
}

export class TaskStep {
    constructor(public task: string) {}
}

export class SystemPromptStep {
    constructor(public systemPrompt: string) {}
}

export enum LogLevel {
    ERROR = 0,  // Only errors
    INFO = 1,   // Normal output (default)
    DEBUG = 2   // Detailed output
}

export class AgentLogger {
    constructor(public level: LogLevel = LogLevel.INFO) {
        console.log(
            `Agent logger initialized with level ${LogLevel[this.level]}.`);
    }

    log(...args: any[]): void {
        if (args[args.length - 1]?.level <= this.level) {
            console.log(...args.slice(0, -1));
        }
    }
}

export abstract class MultiStepAgent {
    protected tools: Record<string, Tool>;
    protected model: (messages: ChatMessage[]) => Promise<string>;
    protected systemPrompt: string;
    protected toolDescriptionTemplate: string;
    protected maxSteps: number;
    protected toolParser?: (output: string) => any;
    protected logger: AgentLogger;
    protected grammar?: Record<string, string>;
    protected planningInterval?: number;
    protected monitor?: any;
    protected lastPlan?: string;
    protected lastFacts?: string;
    protected factsManager: FactsManager;

    constructor(
        tools: Tool[],
        model: (messages: ChatMessage[]) => Promise<string>,
        systemPrompt?: string,
        toolDescriptionTemplate?: string,
        maxSteps: number = 6,
        toolParser?: (output: string) => any,
        addBaseTools: boolean = false,
        verbosityLevel: number = 1,
        grammar?: Record<string, string>,
        planningInterval?: number,
        monitor?: any,
        factsManager?: FactsManager
    ) {
        this.tools = Object.fromEntries(tools.map(tool => [tool.name, tool]));
        if (addBaseTools) {
            Object.assign(this.tools, TOOL_MAPPING);
        }
        this.model = model;
        this.systemPrompt = systemPrompt || TOOL_CALLING_SYSTEM_PROMPT;
        this.toolDescriptionTemplate = toolDescriptionTemplate || DEFAULT_TOOL_DESCRIPTION_TEMPLATE;
        this.maxSteps = maxSteps;
        this.toolParser = toolParser;
        this.logger = new AgentLogger(verbosityLevel as LogLevel);
        this.grammar = grammar;
        this.planningInterval = planningInterval;
        this.monitor = monitor;
        this.factsManager = factsManager || new FactsManager();

        this.logger.log('MultiStepAgent initialized with:', { level: LogLevel.DEBUG });
        this.logger.log('- Tools:', Object.keys(this.tools), { level: LogLevel.DEBUG });
        this.logger.log('- Max steps:', this.maxSteps, { level: LogLevel.DEBUG });
        this.logger.log('- Grammar:', this.grammar, { level: LogLevel.DEBUG });
        this.logger.log('- Planning interval:', this.planningInterval, { level: LogLevel.DEBUG });
    }

    protected async step(logEntry: ActionStep): Promise<any | null> {
        const output = await this.model(logEntry.agentMemory || []);
        logEntry.llmOutput = output;

        let toolCall: ToolCall;
        try {
            const [name, args] = parseJsonToolCall(output);
            toolCall = { name, arguments: args };
        } catch (error) {
            throw new AgentParsingError(`Failed to parse tool call: ${error}`);
        }

        logEntry.toolCalls = [toolCall];

        const tool = this.tools[toolCall.name];
        if (!tool) {
            throw new AgentParsingError(`Unknown tool: ${toolCall.name}`);
        }

        if (tool instanceof Tool) {
            const observation = await tool.call(toolCall.arguments);
            logEntry.observations = observation;
            logEntry.agentMemory?.push({
                role: MessageRole.ASSISTANT,
                content: output,
            });
            logEntry.agentMemory?.push({
                role: MessageRole.USER,
                content: String(observation),
            });
            return null;
        } else {
            throw new AgentParsingError(`Invalid tool type for: ${toolCall.name}`);
        }
    }

    public async run(task: string): Promise<any> {
        this.logger.log(`Starting task: ${task}`, { level: LogLevel.INFO });
        const memory: ChatMessage[] = [
            { role: MessageRole.SYSTEM, content: this.systemPrompt }
        ];

        if (this.planningInterval) {
            const planningStep = await this.plan(task);
            memory.push(
                { role: MessageRole.USER, content: task },
                { role: MessageRole.ASSISTANT, content: planningStep.plan }
            );
            this.lastPlan = planningStep.plan;
            this.lastFacts = planningStep.facts;
        } else {
            memory.push({ role: MessageRole.USER, content: task });
        }

        let step = 0;
        while (step < this.maxSteps) {
            const logEntry = new ActionStep({
                agentMemory: memory,
                step,
                startTime: Date.now()
            });

            try {
                this.logger.log(`Step ${logEntry.step}: Processing...`, { level: LogLevel.DEBUG });
                const result = await this.step(logEntry);
                if (result !== null) {
                    this.logger.log(`Task completed with result:`, result, { level: LogLevel.INFO });
                    return result;
                }
            } catch (error) {
                if (error instanceof AgentError) {
                    throw error;
                }
                throw new AgentExecutionError(`Error during step ${step}: ${error}`);
            }

            step++;
        }

        throw new AgentMaxStepsError(`Maximum number of steps (${this.maxSteps}) reached without finding a solution.`);
    }

    protected async plan(task: string): Promise<PlanningStep> {
        const agentMemory = await this.writeInnerMemoryFromLogs();

        // Get updated facts from the FactsManager
        const factsUpdateMessages = this.factsManager.getFactsUpdateMessages(agentMemory);
        const factsUpdateOutput = await this.model(factsUpdateMessages);
        this.factsManager.updateFacts(factsUpdateOutput);

        // Create plan using the updated facts
        const planMemory: ChatMessage[] = [
            {
                role: MessageRole.SYSTEM,
                content: SYSTEM_PROMPT_PLAN,
            },
            ...agentMemory,
            {
                role: MessageRole.USER,
                content: USER_PROMPT_PLAN
                    .replace('{task}', task)
                    .replace('{tool_descriptions}', getToolDescriptions(this.tools, this.toolDescriptionTemplate))
                    .replace('{answer_facts}', this.factsManager.formatFacts()),
            },
        ];

        const planOutput = await this.model(planMemory);
        return new PlanningStep(planOutput, this.factsManager.formatFacts());
    }

    protected async writeInnerMemoryFromLogs(): Promise<ChatMessage[]> {
        // Initialize memory with system prompt
        const memory: ChatMessage[] = [
            { role: MessageRole.SYSTEM, content: this.systemPrompt }
        ];

        // Add any facts from the facts manager
        const facts = this.factsManager.formatFacts();
        if (facts) {
            memory.push({
                role: MessageRole.USER,
                content: `Here are some facts I know:\n${facts}`
            });
        }

        return memory;
    }
}

export class ToolCallingAgent extends MultiStepAgent {
    constructor(
        tools: Tool[],
        model: (messages: ChatMessage[]) => Promise<string>,
        systemPrompt?: string,
        planningInterval?: number,
        options: Partial<{
            maxSteps: number;
            verbosityLevel: number;
            grammar: Record<string, string>;
            monitor: any;
        }> = {}
    ) {
        super(
            tools,
            model,
            systemPrompt || TOOL_CALLING_SYSTEM_PROMPT,
            undefined,
            options.maxSteps,
            undefined,
            false,
            options.verbosityLevel,
            options.grammar,
            planningInterval,
            options.monitor,
            new FactsManager() // Initialize FactsManager
        );
    }

    protected async step(logEntry: ActionStep): Promise<any | null> {
        this.logger.log(`Starting step ${logEntry.step}`, { level: LogLevel.DEBUG });
        
        const output = await this.model(logEntry.agentMemory || []);
        this.logger.log('Model output:', output, { level: LogLevel.DEBUG });
        logEntry.llmOutput = output;

        let toolCall: ToolCall;
        try {
            const [name, args] = parseJsonToolCall(output);
            toolCall = { name, arguments: args };
            this.logger.log('Parsed tool call:', { name, arguments: args }, { level: LogLevel.DEBUG });
        } catch (error) {
            this.logger.log('Failed to parse tool call:', error, { level: LogLevel.ERROR });
            throw new AgentParsingError(`Failed to parse tool call: ${error}`);
        }

        logEntry.toolCalls = [toolCall];

        const tool = this.tools[toolCall.name];
        if (!tool) {
            this.logger.log(`Unknown tool: ${toolCall.name}`, { level: LogLevel.ERROR });
            this.logger.log('Available tools:', Object.keys(this.tools), { level: LogLevel.ERROR });
            throw new AgentParsingError(`Unknown tool: ${toolCall.name}`);
        }

        if (tool instanceof Tool) {
            this.logger.log(`Executing tool: ${toolCall.name}`, toolCall.arguments, { level: LogLevel.DEBUG });
            const observation = await tool.call(toolCall.arguments);
            this.logger.log('Tool observation:', observation, { level: LogLevel.DEBUG });
            
            logEntry.observations = observation;
            logEntry.agentMemory?.push({
                role: MessageRole.ASSISTANT,
                content: output,
            });
            logEntry.agentMemory?.push({
                role: MessageRole.USER,
                content: String(observation),
            });
            this.logger.log('Updated agent memory', logEntry.agentMemory, { level: LogLevel.DEBUG });
            return null;
        } else {
            this.logger.log(`Invalid tool type for: ${toolCall.name}`, { level: LogLevel.ERROR });
            throw new AgentParsingError(`Invalid tool type for: ${toolCall.name}`);
        }
    }
}

export function getToolDescriptions(
    tools: Record<string, Tool>,
    toolDescriptionTemplate: string
): string {
    return Object.values(tools)
        .map(tool => getToolDescriptionWithArgs(tool, toolDescriptionTemplate))
        .join('\n');
}

export function formatPromptWithTools(
    tools: Record<string, Tool>,
    promptTemplate: string,
    toolDescriptionTemplate: string
): string {
    let prompt = promptTemplate.replace(
        '{{tool_descriptions}}',
        getToolDescriptions(tools, toolDescriptionTemplate)
    );
    
    if (prompt.includes('{{tool_names}}')) {
        prompt = prompt.replace(
            '{{tool_names}}',
            Object.values(tools).map(tool => `'${tool.name}'`).join(', ')
        );
    }
    
    return prompt;
}
