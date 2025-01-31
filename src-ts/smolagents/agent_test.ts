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
    public override description = 'make the product of two numbers: Result = number_one * number_two';
    public override inputs = {
        number_one: {
            type: 'number' as AuthorizedType,
            description: 'The first number to multiply'
       },
       number_two: {
            type: 'number' as AuthorizedType,
            description: 'The second number to multiply'
        }
    };
    public override outputType: AuthorizedType = 'number';

    constructor() {
        super();
    }

    protected override async forward(args: Record<string, any>): Promise<number> {
        console.log("args", args);
        const { number_one, number_two } = args;
        console.log("number_one, number_two", number_one, number_two);
        console.log("types:", typeof number_one, typeof number_two);
        return number_one * number_two;
    }
}

const tools = [new WeatherTool(), new Multipy()];

const model = new OpenAIServerModel(
    'gpt-4',
    'https://api.openai.com/v1',
    process.env.OPENAI_API_KEY || '',
    0.7, 
    tools, 
    {}
);

async function main() {
    const agent = new ToolCallingAgent(
        tools,
        model.toModelFunction(), 
        undefined,  
        4  
    );

    console.log(await agent.run("Find the name of the French Capital. Then find the temperature in this place and multiply it by 2. Mutiply the result by 10."));
}

if (require.main === module) {
    main().catch(console.error);
}
