#!/bin/bash

# Compile TypeScript
npx tsc tool_calling_agent_from_any_llm.ts

# Run the compiled JavaScript
node tool_calling_agent_from_any_llm.js
