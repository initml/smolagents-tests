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


/**
 * Validates that a Tool class follows the proper patterns:
 * 1. Constructor takes no arguments (args chosen at init are not traceable so we cannot rebuild the source code for them)
 * 2. About the class:
 *    - Class properties should only be primitives or simple objects
 *    - Class properties cannot be complex expressions
 * 3. About all class methods:
 *    - All methods must be self-contained
 *    - Methods should only use defined variables and imports
 */
export function validateToolAttributes(toolClass: any): void {
    const errors: string[] = [];

    // Check constructor arguments
    const constructor = toolClass.prototype.constructor;
    if (constructor.length > 0) {
        errors.push(
            'Tool constructor should not take any arguments. All values should be hardcoded!'
        );
    }

    // Get class properties
    const propertyNames = Object.getOwnPropertyNames(toolClass.prototype);
    const staticProps = Object.getOwnPropertyNames(toolClass);

    // Check for required properties
    const requiredProps = ['name', 'description', 'inputs', 'outputType'];
    for (const prop of requiredProps) {
        if (!staticProps.includes(prop) && !propertyNames.includes(prop)) {
            errors.push(`Missing required property: ${prop}`);
        }
    }

    // Check property types
    for (const prop of staticProps) {
        const value = (toolClass as any)[prop];
        if (value !== null && value !== undefined) {
            const type = typeof value;
            if (
                type !== 'string' &&
                type !== 'number' &&
                type !== 'boolean' &&
                type !== 'object'
            ) {
                errors.push(
                    `Property ${prop} has invalid type ${type}. Only primitive types and simple objects are allowed.`
                );
            }

            if (type === 'object' && !isSimpleObject(value)) {
                errors.push(
                    `Property ${prop} is too complex. Only simple objects are allowed.`
                );
            }
        }
    }

    // Check methods
    for (const prop of propertyNames) {
        const descriptor = Object.getOwnPropertyDescriptor(
            toolClass.prototype,
            prop
        );
        if (descriptor && typeof descriptor.value === 'function') {
            validateMethod(toolClass.prototype[prop], prop, errors);
        }
    }

    if (errors.length > 0) {
        throw new Error(
            'Tool validation failed:\n' + errors.map(e => `- ${e}`).join('\n')
        );
    }
}

/**
 * Checks if an object is a "simple" object (only contains primitive values or arrays/objects of primitive values)
 */
function isSimpleObject(obj: any): boolean {
    if (Array.isArray(obj)) {
        return obj.every(item => 
            item === null || 
            ['string', 'number', 'boolean'].includes(typeof item) ||
            (typeof item === 'object' && isSimpleObject(item))
        );
    }

    if (obj === null || typeof obj !== 'object') {
        return false;
    }

    return Object.values(obj).every(value =>
        value === null ||
        ['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'object' && isSimpleObject(value))
    );
}

/**
 * Validates a method to ensure it follows the tool requirements
 */
function validateMethod(method: Function, methodName: string, errors: string[]): void {
    const methodString = method.toString();
    
    // Create a source file from the method string
    const sourceFile = ts.createSourceFile(
        'method.ts',
        methodString,
        ts.ScriptTarget.Latest,
        true
    );

    // Visit the AST to check for issues
    function visit(node: ts.Node) {
        // Check for complex expressions
        if (ts.isNewExpression(node)) {
            errors.push(
                `Method ${methodName} contains 'new' expressions, which are not allowed`
            );
        }

        // Check for dynamic imports
        if (ts.isImportDeclaration(node)) {
            errors.push(
                `Method ${methodName} contains imports, which should be at the module level`
            );
        }

        // Recursively visit all children
        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
}
