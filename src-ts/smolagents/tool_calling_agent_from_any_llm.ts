import { Tool } from '../tools';

interface WeatherOptions {
    location: string;
    celsius?: boolean;
}

class WeatherTool extends Tool {
    name = 'getWeather';
    description = 'Get weather in the next days at given location';
    inputs = {
        location: {
            type: 'string',
            description: 'The location to get weather for'
        },
        celsius: {
            type: 'boolean',
            description: 'Whether to return temperature in Celsius',
            optional: true
        }
    };
    outputType = 'string';

    async forward({ location, celsius = false }: WeatherOptions): Promise<string> {
        return "The weather is UNGODLY with torrential rains and temperatures below -10°C";
    }
}

async function main() {
    const weatherTool = new WeatherTool();
    const result = await weatherTool.forward({ location: "Paris" });
    console.log(result);
}

main().catch(console.error);
