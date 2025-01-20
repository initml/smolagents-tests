from smolagents import (
    CodeAgent,
    DuckDuckGoSearchTool,
    VisitWebpageTool,
    ManagedAgent,
    ToolCallingAgent,
    LiteLLMModel
)

# Then we run the agentic part!
model = LiteLLMModel(model_id="gpt-4o")

agent = ToolCallingAgent(
    tools=[DuckDuckGoSearchTool(), VisitWebpageTool()],
    model=model,
)
managed_agent = ManagedAgent(
    agent=agent,
    name="managed_agent",
    description="This is an agent that can do web search.",
)
manager_agent = CodeAgent(
    tools=[],
    model=model,
    managed_agents=[managed_agent],
)
manager_agent.run(
    "If the US keeps it 2024 growth rate, how many years would it take for the GDP to double?"
)
