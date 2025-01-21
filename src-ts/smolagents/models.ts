import { Tool } from './tools';
import OpenAI from 'openai';

export enum MessageRole {
    USER = 'user',
    ASSISTANT = 'assistant',
    SYSTEM = 'system',
    TOOL_CALL = 'tool-call',
    TOOL_RESPONSE = 'tool-response'
}

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
    role: MessageRole;
    content?: string;
    tool_calls?: ChatMessageToolCall[];
    tool_call_id?: string;
    name?: string;
}

export const toolRoleConversions: Record<MessageRole, MessageRole> = {
    [MessageRole.USER]: MessageRole.USER,
    [MessageRole.ASSISTANT]: MessageRole.ASSISTANT,
    [MessageRole.SYSTEM]: MessageRole.SYSTEM,
    [MessageRole.TOOL_CALL]: MessageRole.ASSISTANT,
    [MessageRole.TOOL_RESPONSE]: MessageRole.USER
};

export function getCleanMessageList(
    messages: ChatMessage[],
    roleConversions: Partial<Record<MessageRole, MessageRole>> = {}
): ChatMessage[] {
    return messages.map(msg => ({
        ...msg,
        role: roleConversions[msg.role] || msg.role
    }));
}

export abstract class Model {
    protected lastInputTokenCount: number = 0;
    protected lastOutputTokenCount: number = 0;

    abstract call(
        messages: ChatMessage[],
        stopSequences?: string[],
        grammar?: string,
        maxTokens?: number,
        toolsToCallFrom?: Tool[]
    ): Promise<ChatMessage>;
}

/**
 * This engine connects to an OpenAI-compatible API server.
 */
export class OpenAIServerModel extends Model {
    private modelId: string;
    private client: OpenAI;
    private temperature: number;
    private kwargs: Record<string, any>;

    constructor(
        modelId: string,
        apiBase: string,
        apiKey: string,
        temperature: number = 0.7,
        kwargs: Record<string, any> = {}
    ) {
        super();
        this.modelId = modelId;
        this.client = new OpenAI({
            baseURL: apiBase,
            apiKey: apiKey,
        });
        this.temperature = temperature;
        this.kwargs = kwargs;
    }

    async call(
        messages: ChatMessage[],
        stopSequences?: string[],
        grammar?: string,
        maxTokens: number = 1500,
        toolsToCallFrom?: Tool[]
    ): Promise<ChatMessage> {
        const cleanMessages = getCleanMessageList(messages, toolRoleConversions);

        const baseParams: OpenAI.Chat.ChatCompletionCreateParams = {
            model: this.modelId,
            messages: cleanMessages as OpenAI.Chat.ChatCompletionMessageParam[],
            stop: stopSequences,
            max_tokens: maxTokens,
            temperature: this.temperature,
            ...this.kwargs,
        };

        if (toolsToCallFrom) {
            const response = await this.client.chat.completions.create({
                ...baseParams,
                tools: toolsToCallFrom.map(tool => ({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: getJsonSchema(tool)
                    }
                }))
            });
            return response.choices[0].message as ChatMessage;
        } else {
            const response = await this.client.chat.completions.create(baseParams);
            return response.choices[0].message as ChatMessage;
        }
    }
}

export const DEFAULT_JSONAGENT_REGEX_GRAMMAR = {
    type: 'regex',
    value: 'Thought: .+?\\nAction:\\n\\{\\n\\s{4}"action":\\s"[^"\\n]+",\\n\\s{4}"action_input":\\s"[^"\\n]+"\\n\\}\\n<end_code>',
};

function getJsonSchema(tool: Tool): Record<string, any> {
    return {
        type: 'object',
        properties: Object.fromEntries(
            Object.entries(tool.inputs).map(([name, input]) => [
                name,
                {
                    type: input.type,
                    description: input.description,
                }
            ])
        ),
        required: Object.entries(tool.inputs)
            .filter(([_, input]) => !input.nullable)
            .map(([name, _]) => name)
    };
}

function removeStopSequences(content: string, stopSequences: string[]): string {
    let result = content;
    for (const stop of stopSequences) {
        if (result.endsWith(stop)) {
            result = result.slice(0, -stop.length);
        }
    }
    return result;
}
