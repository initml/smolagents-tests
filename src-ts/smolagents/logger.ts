export enum LogLevel {
    ERROR = 0,  // Only errors
    INFO = 1,   // Normal output (default)
    DEBUG = 2   // Detailed output
}

export class AgentLogger {
    private static instance: AgentLogger | null = null;
    private constructor(public level: LogLevel = LogLevel.INFO) {
        console.log(
            `Agent logger initialized with level ${LogLevel[this.level]}.`);
    }

    public static getInstance(level: LogLevel = LogLevel.INFO): AgentLogger {
        if (!AgentLogger.instance) {
            AgentLogger.instance = new AgentLogger(level);
        }
        return AgentLogger.instance;
    }

    public setLevel(level: LogLevel): void {
        this.level = level;
        console.log(`Logger level changed to ${LogLevel[this.level]}`);
    }

    log(...args: any[]): void {
        if (args[args.length - 1]?.level <= this.level) {
            console.log(...args.slice(0, -1));
        }
    }
}
