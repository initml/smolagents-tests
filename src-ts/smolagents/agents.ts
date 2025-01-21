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
    constructor(public level: LogLevel = LogLevel.INFO) {}

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
    protected managedAgents: Record<string, ManagedAgent>;
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
        this.managedAgents = {};
        this.planningInterval = planningInterval;
        this.monitor = monitor;
        this.factsManager = factsManager || new FactsManager();
    }

    protected async step(logEntry: ActionStep): Promise<any | null> {
        throw new Error('Method not implemented');
    }

    public async run(task: string): Promise<any> {
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

        for (let step = 0; step < this.maxSteps; step++) {
            const logEntry = new ActionStep({
                agentMemory: memory,
                step: step + 1,
                startTime: Date.now()
            });

            try {
                const result = await this.step(logEntry);
                if (result !== null) {
                    return result;
                }
            } catch (error) {
                if (error instanceof AgentError) {
                    throw error;
                }
                throw new AgentExecutionError(String(error));
            }

            if (step === this.maxSteps - 1) {
                throw new AgentMaxStepsError();
            }
        }
    }

    protected async plan(task: string): Promise<PlanningStep> {
        const agentMemory = this.writeInnerMemoryFromLogs();

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
                    .replace('{managed_agents_descriptions}', showAgentsDescriptions(this.managedAgents))
                    .replace('{answer_facts}', this.factsManager.formatFacts()),
            },
        ];

        const planOutput = await this.model(planMemory);
        return new PlanningStep(planOutput, this.factsManager.formatFacts());
    }

    public addManagedAgent(agent: ManagedAgent): void {
        this.managedAgents[agent.name] = agent;
        this.systemPrompt = formatPromptWithManagedAgentsDescriptions(
            this.systemPrompt,
            this.managedAgents
        );
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
        const output = await this.model(logEntry.agentMemory!);
        logEntry.llmOutput = output;

        try {
            const toolCall = parseJsonToolCall(output);
            if (toolCall.name === 'finalAnswer') {
                return toolCall.arguments.answer;
            }

            const tool = this.tools[toolCall.name] || this.managedAgents[toolCall.name];
            if (!tool) {
                throw new AgentParsingError(`Unknown tool: ${toolCall.name}`);
            }

            const observation = await tool.forward(toolCall.arguments);
            logEntry.agentMemory!.push(
                { role: MessageRole.ASSISTANT, content: output },
                { role: MessageRole.USER, content: String(observation) }
            );
            return null;
        } catch (error) {
            throw new AgentParsingError(String(error));
        }
    }
}

export class CodeAgent extends MultiStepAgent {
    private pythonExecutor: any;
    private authorizedImports: string[];

    constructor(
        tools: Tool[],
        model: (messages: ChatMessage[]) => Promise<string>,
        systemPrompt?: string,
        grammar?: Record<string, string>,
        additionalAuthorizedImports?: string[],
        planningInterval?: number,
        useE2bExecutor: boolean = false,
        options: Partial<{
            maxSteps: number;
            verbosityLevel: number;
            monitor: any;
        }> = {}
    ) {
        super(
            tools,
            model,
            systemPrompt || CODE_SYSTEM_PROMPT,
            undefined,
            options.maxSteps,
            undefined,
            false,
            options.verbosityLevel,
            grammar,
            planningInterval,
            options.monitor,
            new FactsManager()
        );

        this.authorizedImports = [...(additionalAuthorizedImports || [])];
        
        if (!this.systemPrompt.includes('{{authorized_imports}}')) {
            throw new AgentError("Tag '{{authorized_imports}}' should be provided in the prompt.");
        }

        this.systemPrompt = this.systemPrompt.replace(
            '{{authorized_imports}}',
            this.authorizedImports.includes('*')
                ? 'You can import from any package you want.'
                : String(this.authorizedImports)
        );

        if (this.authorizedImports.includes('*')) {
            this.logger.log(
                'Caution: you set an authorization for all imports, meaning your agent can decide to import any package it deems necessary. This might raise issues if the package is not installed in your environment.',
                { level: LogLevel.ERROR }
            );
        }

        // TODO: implement Python executor initialization
        this.pythonExecutor = null;
    }

    protected async step(logEntry: ActionStep): Promise<any | null> {
        const output = await this.model(logEntry.agentMemory!);
        logEntry.llmOutput = output;

        try {
            const codeBlobs = parseCodeBlobs(output);
            if (codeBlobs.length === 0) {
                throw new AgentParsingError('No code block found in the output');
            }

            const code = codeBlobs[codeBlobs.length - 1];
            // TODO: implement Python executor
            const result = null; // await this.pythonExecutor.execute(code);

            logEntry.agentMemory!.push(
                { role: MessageRole.ASSISTANT, content: output },
                { role: MessageRole.USER, content: String(result) }
            );
            return null;
        } catch (error) {
            throw new AgentParsingError(String(error));
        }
    }
}

export class ManagedAgent {
    constructor(
        public agent: MultiStepAgent,
        public name: string,
        public description: string,
        public additionalPrompting?: string,
        public provideRunSummary: boolean = false,
        public managedAgentPrompt: string = MANAGED_AGENT_PROMPT
    ) {}

    public writeFullTask(task: string): string {
        return this.managedAgentPrompt
            .replace('{name}', this.name)
            .replace('{task}', task)
            .replace('{additional_prompting}', this.additionalPrompting || '');
    }

    public async forward(request: string): Promise<any> {
        return this.agent.run(this.writeFullTask(request));
    }
}

export function showAgentsDescriptions(managedAgents: Record<string, ManagedAgent>): string {
    let descriptions = `
You can also give requests to team members.
Calling a team member works the same as for calling a tool: simply, the only argument you can give in the call is 'request', a long string explaining your request.
Given that this team member is a real human, you should be very verbose in your request.
Here is a list of the team members that you can call:`;

    for (const agent of Object.values(managedAgents)) {
        descriptions += `\n- ${agent.name}: ${agent.description}`;
    }
    
    return descriptions;
}

export function formatPromptWithManagedAgentsDescriptions(
    promptTemplate: string,
    managedAgents: Record<string, ManagedAgent>,
    agentDescriptionsPlaceholder: string = '{{managed_agents_descriptions}}'
): string {
    if (!promptTemplate.includes(agentDescriptionsPlaceholder)) {
        throw new Error(
            `Provided prompt template does not contain the managed agents descriptions placeholder '${agentDescriptionsPlaceholder}'`
        );
    }

    if (Object.keys(managedAgents).length > 0) {
        return promptTemplate.replace(
            agentDescriptionsPlaceholder,
            showAgentsDescriptions(managedAgents)
        );
    } else {
        return promptTemplate.replace(agentDescriptionsPlaceholder, '');
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
