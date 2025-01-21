import { Tool, AuthorizedType } from './tools';

interface WeatherOptions {
    location: string;
    celsius?: boolean;
}

export class WeatherTool extends Tool {
    name = 'weather';
    description = 'Get the current weather for a location';
    inputs = {
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
    outputType: AuthorizedType = 'string';

    async forward({ location, celsius = true }: WeatherOptions): Promise<string> {
        // Mock implementation
        const temp = celsius ? 20 : 68;
        const unit = celsius ? 'C' : 'F';
        return `The temperature in ${location} is ${temp}°${unit}`;
    }
}

async function main() {
    const weatherTool = new WeatherTool();
    const result = await weatherTool.forward({ location: "Paris" });
    console.log(result);
}

main().catch(console.error);
