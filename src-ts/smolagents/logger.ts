export enum LogLevel {
    ERROR = 0,  // Only errors
    INFO = 1,   // Normal output (default)
    DEBUG = 2   // Detailed output
}

export interface LoggerConfig {
    level: LogLevel;
    source: string;
}

export class AgentLogger {
    private static instances: Map<string, AgentLogger> = new Map();
    private constructor(public level: LogLevel = LogLevel.INFO, private source: string = 'default') {
        console.log(
            `Agent logger initialized for source '${this.source}' with level ${LogLevel[this.level]}.`);
    }

    public static getInstance(config?: Partial<LoggerConfig>): AgentLogger {
        const source = config?.source || 'default';
        const level = config?.level ?? LogLevel.INFO;
        
        if (!AgentLogger.instances.has(source)) {
            AgentLogger.instances.set(source, new AgentLogger(level, source));
        }
        return AgentLogger.instances.get(source)!;
    }

    public setLevel(level: LogLevel): void {
        this.level = level;
        console.log(`Logger level changed to ${LogLevel[this.level]} for source '${this.source}'`);
    }

    log(...args: any[]): void {
        if (args[args.length - 1]?.level <= this.level) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${this.source}] [${LogLevel[args[args.length - 1].level]}]`, ...args.slice(0, -1));
        }
    }
}
