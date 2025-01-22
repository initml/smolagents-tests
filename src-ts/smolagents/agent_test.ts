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

export class Multipy extends Tool {
    public override name = 'multiplicator';
    public override description = 'make the product of two numbers';
    public override inputs = {
        a: {
            type: 'number' as AuthorizedType,
            description: 'The first number to multiply'
       },
        b: {
            type: 'number' as AuthorizedType,
            description: 'The second number to multiply'
        }
    };
    public override outputType: AuthorizedType = 'number';

    constructor() {
        super();
    }

    protected override async forward(args: Record<string, any>): Promise<number> {
        const { a, b } = args;
        return a * b;
    }
}


const model = new OpenAIServerModel(
    'gpt-4',
    'https://api.openai.com/v1',
    process.env.OPENAI_API_KEY || ''
);

const agent = new ToolCallingAgent(
    [new WeatherTool(), new Multipy()], // tools
    model.toModelFunction(), // model
);

async function main() {
    console.log(await agent.run("What's the temperature in Paris, multiply by 2?"));
}

if (require.main === module) {
    main().catch(console.error);
}
