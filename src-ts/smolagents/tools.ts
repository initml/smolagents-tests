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


    /**
     * Setup method that will be called before the first use of the tool.
     * Override this method if your tool needs initialization.
     */
    protected async setup(): Promise<void> {
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
        if (!this.isInitialized) {
            await this.setup();
            this.isInitialized = true;
        }
        return this.forward(...args);
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
    // Simple template replacement
    return descriptionTemplate
        .replace('{{ tool.name }}', tool.name)
        .replace('{{ tool.description }}', tool.description)
        .replace('{{tool.inputs}}', JSON.stringify(tool.inputs, null, 2))
        .replace('{{tool.outputType}}', tool.outputType);
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
    return function(target: any) {
        return class extends Tool {
            constructor() {
                super();
                this.name = config.name;
                this.description = config.description;
                this.inputs = config.inputs;
                this.outputType = config.outputType;
            }

            protected async forward(...args: any[]): Promise<any> {
                return target.prototype.forward.apply(this, args);
            }
        };
    };
}
