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

import * as vm from 'vm';

export const BASE_JS_TOOLS = {
    finalAnswer: (answer: any) => {
        return [answer, true];
    },
    print: (...args: any[]) => {
        const output = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        return output;
    },
};

interface ExecutionState {
    printOutputs: string[];
}

/**
 * Evaluates JavaScript code in a sandboxed environment
 * @param code The JavaScript code to evaluate
 * @param state Object to store execution state (like print outputs)
 * @param staticTools Tools available to the code
 * @returns [result, isFinalAnswer]
 */
export async function evaluateJavaScriptCode(
    code: string,
    state: ExecutionState,
    staticTools: typeof BASE_JS_TOOLS
): Promise<[any, boolean]> {
    // Create a sandbox context
    const context = vm.createContext({
        console: {
            log: (...args: any[]) => {
                const output = staticTools.print(...args);
                state.printOutputs.push(output);
            },
        },
        ...staticTools,
    });

    try {
        // Wrap the code in an async function to support await
        const wrappedCode = `
            (async () => {
                try {
                    ${code}
                } catch (error) {
                    return [error.toString(), false];
                }
            })()
        `;

        // Execute the code
        const result = await vm.runInContext(wrappedCode, context, {
            timeout: 5000, // 5 second timeout
            displayErrors: true,
        });

        // Handle the result
        if (Array.isArray(result) && result.length === 2 && typeof result[1] === 'boolean') {
            return result as [any, boolean];
        }
        // If result is not a valid tuple, wrap it as a non-final answer
        return [result, false];
    } catch (error) {
        if (error instanceof Error) {
            return [error.message, false];
        }
        return ['Unknown error occurred', false];
    }
}

/**
 * Creates a safe subset of JavaScript built-in objects
 */
export function createSafeBuiltins() {
    const safeBuiltins = {
        Array,
        Boolean,
        Date,
        Error,
        JSON,
        Math,
        Number,
        Object,
        RegExp,
        String,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
    };

    return Object.freeze(safeBuiltins);
}

/**
 * Wraps a tool to make it safe for use in the JavaScript executor
 */
export function wrapToolForExecution(tool: any): (...args: any[]) => Promise<[any, boolean]> {
    return async (...args: any[]): Promise<[any, boolean]> => {
        try {
            const result = await tool(...args);
            // If result is already a tuple with [value, boolean], return it
            if (Array.isArray(result) && result.length === 2 && typeof result[1] === 'boolean') {
                return result as [any, boolean];
            }
            // Otherwise, wrap the result in a tuple with false to indicate it's not a final answer
            return [result, false];
        } catch (error) {
            if (error instanceof Error) {
                return [error.message, false];
            }
            return ['Tool execution failed with unknown error', false];
        }
    };
}
