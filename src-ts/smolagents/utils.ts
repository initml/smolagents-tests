import { LogLevel, AgentLogger } from './logger';

const LOG_LEVEL = LogLevel.ERROR;  // Set default log level for this file

// Base built-in modules that are allowed
export const BASE_BUILTIN_MODULES = [
    'collections',
    'datetime',
    'itertools',
    'math',
    'queue',
    'random',
    're',
    'stat',
    'statistics',
    'time',
    'unicodedata',
];

/**
 * Base class for other agent-related exceptions
 */
export class AgentError extends Error {
    message: string;

    constructor(message: string) {
        super(message);
        this.message = message;
        console.error(`\x1b[1m\x1b[31m${message}\x1b[0m`); // Bold red text in terminal
    }
}

/**
 * Exception raised for errors in parsing in the agent
 */
export class AgentParsingError extends AgentError {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Exception raised for errors in execution in the agent
 */
export class AgentExecutionError extends AgentError {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Exception raised for errors in maximum steps reached in the agent
 */
export class AgentMaxStepsError extends AgentError {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Exception raised for errors in generation in the agent
 */
export class AgentGenerationError extends AgentError {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Parse a JSON blob string into an object
 */
export function parseJsonBlob(jsonBlob: string): Record<string, any> {
    const logger = AgentLogger.getInstance({ source: 'parseJsonBlob', level: LOG_LEVEL });
    try {
        const firstAccoladeIndex = jsonBlob.indexOf('{');
        const lastAccoladeIndex = jsonBlob.lastIndexOf('}');
        const cleanedJson = jsonBlob
            .slice(firstAccoladeIndex, lastAccoladeIndex + 1)
            .replace(/\\"/g, "'");
        logger.log(`Parsing JSON blob: ${cleanedJson}`, { level: LOG_LEVEL });
        return JSON.parse(cleanedJson);
    } catch (e) {
        if (e instanceof SyntaxError) {
            const errorMessage = e.message;
            if (jsonBlob.includes('},\n')) {
                throw new Error(
                    'JSON is invalid: you probably tried to provide multiple tool calls in one action. PROVIDE ONLY ONE TOOL CALL.'
                );
            }
            throw new Error(
                `The JSON blob you used is invalid due to the following error: ${errorMessage}.\n` +
                `JSON blob was: ${jsonBlob}`
            );
        }
        throw new Error(`Error in parsing the JSON blob: ${e}`);
    }
}

/**
 * Parse a JSON tool call and extract the tool name and arguments
 */
export function parseJsonToolCall(input: any): [string, any | null] {
    const logger = AgentLogger.getInstance({ source: 'parseJsonToolCall', level: LOG_LEVEL });
    logger.log(`Parsing tool call from:`, input, { level: LOG_LEVEL });
    
    // Handle OpenAI function call format
    if (typeof input === 'object' && input.tool_calls && Array.isArray(input.tool_calls)) {
        const toolCall = input.tool_calls[0];
        if (toolCall && toolCall.function) {
            return [toolCall.function.name, toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : null];
        }
    }

    // Handle string input (old format)
    if (typeof input === 'string') {
        const cleanedJson = input.replace(/```json/g, '').replace(/```/g, '');
        const toolCall = parseJsonBlob(cleanedJson);
        
        const toolNameKeys = ['action', 'tool_name', 'tool', 'name', 'function'];
        const toolArgsKeys = ['arguments', 'action_input', 'tool_arguments', 'tool_args', 'parameters'];
        
        let toolName: string | null = null;
        let toolArgs: any | null = null;
        
        for (const key of toolNameKeys) {
            if (key in toolCall) {
                toolName = toolCall[key];
                logger.log(`Found tool name under key '${key}': ${toolName}`, { level: LOG_LEVEL });
                break;
            }
        }
        
        for (const key of toolArgsKeys) {
            if (key in toolCall) {
                toolArgs = toolCall[key];
                logger.log(`Found tool args under key '${key}': ${JSON.stringify(toolArgs)}`, { level: LOG_LEVEL });
                break;
            }
        }
        
        if (!toolName) {
            throw new AgentParsingError(
                `No tool name key found in tool call! Tool call: ${input}`
            );
        }
        
        return [toolName, toolArgs];
    }

    throw new AgentParsingError(
        `Invalid input format for tool call: ${JSON.stringify(input)}`
    );
}

export const MAX_LENGTH_TRUNCATE_CONTENT = 20000;

/**
 * Truncate content to a maximum length while preserving content from both ends
 */
export function truncateContent(
    content: string,
    maxLength: number = MAX_LENGTH_TRUNCATE_CONTENT
): string {
    if (content.length <= maxLength) {
        return content;
    }
    
    const halfLength = Math.floor(maxLength / 2);
    return (
        content.slice(0, halfLength) +
        `\n..._This content has been truncated to stay below ${maxLength} characters_...\n` +
        content.slice(-halfLength)
    );
}

// Note: The Python ImportFinder, get_method_source, is_same_method, is_same_item, and instance_to_source
// functions are specific to Python's AST and reflection capabilities. They don't have direct TypeScript
// equivalents since TypeScript's type system works differently at runtime.
