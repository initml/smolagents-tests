from smolagents import load_tool, CodeAgent, DuckDuckGoSearchTool
from smolagents import tool, LiteLLMModel
model = LiteLLMModel(model_id="gpt-4o")

search_tool = DuckDuckGoSearchTool()

agent = CodeAgent(
    tools=[search_tool],
    model=model,
    planning_interval=3 # This is where you activate planning!
)

# Run it!
result = agent.run(
    "How long would a cheetah at full speed take to run the length of Pont Alexandre III?",
)