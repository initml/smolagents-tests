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
    'image',
    'audio',
    'any',
    'object',
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
    nullable?: boolean;
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
    public name: string;
    public description: string;
    public inputs: Record<string, ToolInput>;
    public outputType: AuthorizedType;
    protected isInitialized: boolean = false;

    constructor() {
        this.validateArguments();
    }

    protected validateArguments(): void {
        if (!this.name || typeof this.name !== 'string') {
            throw new TypeError('Tool must have a name of type string');
        }

        if (!this.description || typeof this.description !== 'string') {
            throw new TypeError('Tool must have a description of type string');
        }

        if (!this.inputs || typeof this.inputs !== 'object') {
            throw new TypeError('Tool must have inputs of type object');
        }

        for (const [inputName, inputContent] of Object.entries(this.inputs)) {
            if (typeof inputContent !== 'object') {
                throw new TypeError(`Input '${inputName}' should be an object`);
            }

            if (!('type' in inputContent) || !('description' in inputContent)) {
                throw new TypeError(
                    `Input '${inputName}' should have keys 'type' and 'description'`
                );
            }

            if (!AUTHORIZED_TYPES.includes(inputContent.type)) {
                throw new TypeError(
                    `Input '${inputName}': type '${inputContent.type}' is not an authorized value, should be one of ${AUTHORIZED_TYPES.join(', ')}`
                );
            }
        }

        if (!AUTHORIZED_TYPES.includes(this.outputType)) {
            throw new TypeError(
                `Output type '${this.outputType}' is not an authorized value, should be one of ${AUTHORIZED_TYPES.join(', ')}`
            );
        }
    }

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
    protected abstract forward(...args: any[]): Promise<any>;

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
