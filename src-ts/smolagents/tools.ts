import { LogLevel, AgentLogger } from './logger';

const LOG_LEVEL = LogLevel.INFO;  // Set default log level for this file

export const AUTHORIZED_TYPES = [
    'string',
    'boolean',
    'integer',
    'number',
] as const;

export type AuthorizedType = typeof AUTHORIZED_TYPES[number];

export const CONVERSION_DICT: Record<string, AuthorizedType> = {
    'str': 'string',
    'int': 'integer',
    'float': 'number',
};

export interface ToolInput {
    type: AuthorizedType;
    description: string;
    optional?: boolean;
}

export interface ToolConfig {
    name: string;
    description: string;
    inputs: Record<string, ToolInput>;
    outputType: AuthorizedType;
}

/**
 * Base class for the functions used by the agent.
 */
export abstract class Tool implements ToolConfig {
    public name!: string;
    public description!: string;
    public inputs!: Record<string, ToolInput>;
    public outputType!: AuthorizedType;
    protected isInitialized: boolean = false;
    protected logger: AgentLogger;

    constructor() {
        this.logger = AgentLogger.getInstance({ source: this.constructor.name, level: LOG_LEVEL });
    }

    /**
     * Setup method that will be called before the first use of the tool.
     * Override this method if your tool needs initialization.
     */
    protected async setup(): Promise<void> {
        this.logger.log(`Setting up tool: ${this.name}`, { level: LogLevel.DEBUG });
        // Default implementation does nothing
    }

    /**
     * Main method to implement in subclasses.
     * This is where the actual tool functionality should be implemented.
     */
    protected async forward(...args: any[]): Promise<any> {
        throw new Error('Method not implemented.');
    }

    /**
     * Main entry point to use the tool.
     * Handles initialization and forwards the call to the actual implementation.
     */
    public async call(...args: any[]): Promise<any> {
        this.logger.log(`Calling tool ${this.name} with args: ${JSON.stringify(args)}`, { level: LogLevel.INFO });
        
        if (!this.isInitialized) {
            this.logger.log(`Initializing tool ${this.name}`, { level: LogLevel.DEBUG });
            await this.setup();
            this.isInitialized = true;
        }

        try {
            const result = await this.forward(...args);
            this.logger.log(`Tool ${this.name} completed successfully`, { level: LogLevel.DEBUG });
            return result;
        } catch (error) {
            const errorMsg = `Tool ${this.name} failed: ${error}`;
            this.logger.log(errorMsg, { level: LogLevel.ERROR });
            throw new Error(errorMsg);
        }
    }
}

export const DEFAULT_TOOL_DESCRIPTION_TEMPLATE = `
- {{ tool.name }}: {{ tool.description }}
    Takes inputs: {{tool.inputs}}
    Returns: {{tool.outputType}}
`;

/**
 * Gets a formatted description of a tool with its arguments
 */
export function getToolDescriptionWithArgs(
    tool: Tool,
    descriptionTemplate: string = DEFAULT_TOOL_DESCRIPTION_TEMPLATE
): string {
    const logger = AgentLogger.getInstance({ source: 'ToolUtils', level: LOG_LEVEL });
    logger.log(`Generating description for tool: ${tool.name}`, { level: LogLevel.DEBUG });
    
    // Simple template replacement
    const description = descriptionTemplate
        .replace('{{ tool.name }}', tool.name)
        .replace('{{ tool.description }}', tool.description)
        .replace('{{tool.inputs}}', JSON.stringify(tool.inputs, null, 2))
        .replace('{{tool.outputType}}', tool.outputType);
    
    logger.log(`Generated tool description of length ${description.length}`, { level: LogLevel.DEBUG });
    return description;
}

/**
 * Decorator that adds a description to a function
 */
export function addDescription(description: string) {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        target.description = description;
        return descriptor;
    };
}

/**
 * Converts a function into a Tool instance
 */
export function tool(config: ToolConfig) {
    const logger = AgentLogger.getInstance({ source: 'ToolDecorator', level: LOG_LEVEL });
    logger.log(`Creating tool decorator for: ${config.name}`, { level: LogLevel.DEBUG });
    
    return function(target: any) {
        logger.log(`Applying tool decorator to class: ${target.name}`, { level: LogLevel.DEBUG });
        return class extends Tool {
            constructor() {
                super();
                this.name = config.name;
                this.description = config.description;
                this.inputs = config.inputs;
                this.outputType = config.outputType;
                this.logger.log(`Initialized tool ${this.name}`, { level: LogLevel.DEBUG });
            }

            protected async forward(...args: any[]): Promise<any> {
                return target.prototype.forward.apply(this, args);
            }
        };
    };
}
