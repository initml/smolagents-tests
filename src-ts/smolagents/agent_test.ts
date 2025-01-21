import { Tool, AuthorizedType } from './tools';
import { ToolCallingAgent } from './agents';
import { OpenAIServerModel } from './models';

export class WeatherTool extends Tool {
    public override name = 'weatherForecast';
    public override description = 'Get the current weather for a location';
    public override inputs = {
        location: {
            type: 'string' as AuthorizedType,
            description: 'The location to get weather for'
        },
        celsius: {
            type: 'boolean' as AuthorizedType,
            description: 'Whether to return temperature in celsius',
            optional: true
        }
    };
    public override outputType: AuthorizedType = 'string';

    constructor() {
        super();
    }

    protected override async forward(args: Record<string, any>): Promise<string> {
        const { location, celsius = true } = args;
        return "The weather is UNGODLY with torrential rains and temperatures below -10°C";
    }
}

const weatherTool = new WeatherTool();

const model = new OpenAIServerModel(
    'gpt-4',
    'https://api.openai.com/v1',
    process.env.OPENAI_API_KEY || ''
);

const agent = new ToolCallingAgent(
    [weatherTool], // tools
    model.toModelFunction(), // model
    undefined, // systemPrompt
    undefined, // planningInterval
    {
        verbosityLevel: 2  // Set to DEBUG level
    }
);

async function main() {
    console.log(await agent.run("What's the weather like in Paris?"));
}

if (require.main === module) {
    main().catch(console.error);
}
