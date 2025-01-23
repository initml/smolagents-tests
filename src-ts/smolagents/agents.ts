import { Tool } from './tools';
import { TOOL_MAPPING } from './default_tools';
import { MessageRole, ChatMessage } from './models';
import { getSystemPromptPlan,
    getToolCallingSystemPrompt,
    getUserPromptPlan } from './prompts';
import { 
    DEFAULT_TOOL_DESCRIPTION_TEMPLATE,
    getToolDescriptionWithArgs
} from './tools';
import {
    AgentError,
    AgentExecutionError,
    AgentMaxStepsError,
    AgentParsingError,
    parseJsonToolCall
} from './utils';
import { FactsManager } from './facts';
import { LogLevel, AgentLogger } from './logger';

const LOG_LEVEL = LogLevel.DEBUG;  // Set default log level for this file

export interface ToolCall {
    name: string;
    arguments: any;
    id?: string;
}

export class ActionStep {
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

export class ToolCallingAgent {
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
    protected logs: (ActionStep | PlanningStep | TaskStep | SystemPromptStep)[] = [];

    constructor(
        tools: Tool[],
        model: (messages: ChatMessage[]) => Promise<string>,
        systemPrompt?: string,
        planningInterval?: number,
        options: Partial<{
            maxSteps: number;
            grammar: Record<string, string>;
            monitor: any;
        }> = {}
    ) {
        this.tools = Object.fromEntries(tools.map(tool => [tool.name, tool]));
        // Instantiate the base tools
        const baseTools = Object.fromEntries(
            Object.entries(TOOL_MAPPING).map(([name, ToolClass]) => [name, new (ToolClass as new () => Tool)()])
        );
        Object.assign(this.tools, baseTools);
        
        this.model = model;
        this.systemPrompt = systemPrompt || getToolCallingSystemPrompt(tools.map(t => t.name));
        this.toolDescriptionTemplate = DEFAULT_TOOL_DESCRIPTION_TEMPLATE;
        this.maxSteps = options.maxSteps || 6;
        this.toolParser = undefined;
        this.logger = AgentLogger.getInstance({ source: 'ToolCallingAgent', level: LOG_LEVEL });
        this.grammar = options.grammar;
        this.planningInterval = planningInterval;
        this.monitor = options.monitor;
        this.factsManager = new FactsManager();

        this.logger.log('ToolCallingAgent initialized with:', { level: LogLevel.DEBUG });
        this.logger.log('- Tools:', Object.keys(this.tools), { level: LogLevel.INFO });
        this.logger.log('- Max steps:', this.maxSteps, { level: LogLevel.DEBUG });
        this.logger.log('- Grammar:', this.grammar, { level: LogLevel.DEBUG });
        this.logger.log('- Planning interval:', planningInterval, { level: LogLevel.DEBUG });
    }

    protected async step(logEntry: ActionStep): Promise<any | null> {
        this.logger.log(`Starting step ${logEntry.step}`, { level: LogLevel.INFO });
        
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
            this.logger.log(`Executing tool: ${toolCall.name}`, toolCall.arguments, { level: LogLevel.INFO });

            // Handle final answer
            if (toolCall.name === 'finalAnswer') {
                let finalAnswer = toolCall.arguments;
                if (typeof finalAnswer === 'object' && 'answer' in finalAnswer) {
                    finalAnswer = finalAnswer.answer;
                }
                this.logger.log('Final answer:', finalAnswer, { level: LogLevel.INFO });
                return finalAnswer;
            }

            const observation = await tool.call(toolCall.arguments);
            this.logger.log('Tool observation:', observation, { level: LogLevel.INFO });
            
            logEntry.observations = observation;
            logEntry.agentMemory?.push({
                role: MessageRole.ASSISTANT,
                content: output,
            });
            logEntry.agentMemory?.push({
                role: MessageRole.USER,
                content: String(observation),
            });
            this.logger.log('Updated agent memory', logEntry.agentMemory?.toString(), { level: LogLevel.DEBUG, id: "log_memory" });
            return null;
        } else {
            this.logger.log(`Invalid tool type for: ${toolCall.name}`, { level: LogLevel.ERROR });
            throw new AgentParsingError(`Invalid tool type for: ${toolCall.name}`);
        }
    }

    public async run(task: string): Promise<any> {
        this.logger.log(`Running task: ${task}`, { level: LogLevel.DEBUG });

        const memory: ChatMessage[] = [
            { role: MessageRole.SYSTEM, content: this.systemPrompt }
        ];

        memory.push({ role: MessageRole.USER, content: task });
        this.logger.log(`Memory: ${JSON.stringify(memory)}`, { level: LogLevel.DEBUG, id: "memory" }); 
        let step = 0;
        let finalAnswer: any = null;

        while (step < this.maxSteps) {
            const logEntry = new ActionStep({
                agentMemory: memory,
                step,
                startTime: Date.now()
            });

            try {
                // Check if planning is needed at this step
                if (this.planningInterval && step % this.planningInterval === 0) {
                    this.logger.log('do planning', { level: LogLevel.DEBUG });
                    const planningStep = await this.plan(task, step === 0);
                    memory.push(
                        { role: MessageRole.ASSISTANT, content: planningStep.plan }
                    );
                    this.lastPlan = planningStep.plan;
                    this.lastFacts = planningStep.facts;
                }

                this.logger.log(`Step ${logEntry.step}: Processing...`, { level: LogLevel.DEBUG });
                const result = await this.step(logEntry);
                if (result !== null) {
                    finalAnswer = result;
                    this.logger.log(`Task completed with result:`, finalAnswer, { level: LogLevel.INFO });
                    break;
                }
            } catch (error) {
                if (error instanceof AgentError) {
                    throw error;
                }
                throw new AgentExecutionError(`Error during step ${step}: ${error}`);
            }

            step++;
        }

        if (finalAnswer !== null) {
            return finalAnswer;
        }

        throw new AgentMaxStepsError(`Maximum number of steps (${this.maxSteps}) reached without finding a solution.`);
    }

    protected async writeInnerMemoryFromLogs(): Promise<ChatMessage[]> {
        this.logger.log('Writing inner memory from logs...', { level: LogLevel.DEBUG });
        const memory: ChatMessage[] = [
            { role: MessageRole.SYSTEM, content: this.systemPrompt }
        ];

        for (const log of this.logs) {
            this.logger.log(`Processing log entry type: ${log.constructor.name}`, { level: LogLevel.DEBUG });
            
            if (log instanceof ActionStep) {
                if (log.agentMemory) {
                    this.logger.log(`Adding ${log.agentMemory.length} messages from ActionStep`, { level: LogLevel.DEBUG });
                    memory.push(...log.agentMemory);
                }
            }
        }

        this.logger.log(`Final memory size: ${memory.length} messages`, { level: LogLevel.DEBUG });
        return memory;
    }

    protected async plan(task: string, isFirstStep: boolean = false): Promise<PlanningStep> {
        this.logger.log(`Starting planning step. isFirstStep: ${isFirstStep}`, { level: LogLevel.DEBUG });
        
        const agentMemory = await this.writeInnerMemoryFromLogs();
        this.logger.log(`Agent memory size: ${agentMemory.length}`, { level: LogLevel.DEBUG });

        // Get updated facts from the FactsManager
        this.logger.log('Getting facts update messages...', { level: LogLevel.DEBUG });
        const factsUpdateMessages = this.factsManager.getFactsUpdateMessages(agentMemory);
        this.logger.log(`Facts update messages size: ${factsUpdateMessages.length}`, { level: LogLevel.DEBUG });
        
        const factsUpdateOutput = await this.model(factsUpdateMessages);
        this.logger.log('Updating facts with model output...', { level: LogLevel.DEBUG });
        this.factsManager.updateFacts(factsUpdateOutput);

        // Create plan using the updated facts
        const planMemory: ChatMessage[] = [
            {
                role: MessageRole.SYSTEM,
                content: getSystemPromptPlan(),
            },
            ...agentMemory,
            {
                role: MessageRole.USER,
                content: getUserPromptPlan(
                    task,
                    getToolDescriptions(this.tools, this.toolDescriptionTemplate),
                    '',  // managedAgentsDescriptions
                    this.factsManager.formatFacts()
                ),
            },
        ];

        this.logger.log(`Plan memory size: ${planMemory.length}`, { level: LogLevel.DEBUG });
        const planOutput = await this.model(planMemory);
        this.logger.log('Received plan output from model', { level: LogLevel.DEBUG });

        return new PlanningStep(planOutput, this.factsManager.formatFacts());
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
