import { diffChars, Change } from 'diff';

// ANSI color codes
const COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    GRAY: '\x1b[90m',
    RESET: '\x1b[0m'
} as const;

export enum LogLevel {
    ERROR = 0,  // Only errors
    INFO = 1,   // Normal output (default)
    DEBUG = 2   // Detailed output
}

export interface LoggerConfig {
    level: LogLevel;
    source: string;
}

interface LogOptions {
    level: LogLevel;
    id?: string;
}

export class AgentLogger {
    private static instances: Map<string, AgentLogger> = new Map();
    private previousLogs: Map<string, string> = new Map();

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

    /**
     * Log a message with optional id for diff tracking
     * @param args The items to log. The last argument must be a LogOptions object.
     */
    log(...args: any[]): void {
        const options = args[args.length - 1] as LogOptions;
        if (options?.level <= this.level) {
            const timestamp = new Date().toISOString();
            const messageArgs = args.slice(0, -1);
            const message = messageArgs.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');

            // If an id is provided, check for diffs
            if (options.id) {
                const previousMessage = this.previousLogs.get(options.id);
                if (previousMessage) {
                    // Calculate and display diff
                    const diff = diffChars(previousMessage, message);
                    const coloredDiff = diff.map((part: Change) => {
                        if (part.added) {
                            return `${COLORS.GREEN}${part.value}${COLORS.RESET}`;
                        }
                        if (part.removed) {
                            return `${COLORS.RED}${part.value}${COLORS.RESET}`;
                        }
                        return `${COLORS.GRAY}${part.value}${COLORS.RESET}`;
                    }).join('');

                    console.log(
                        `[${timestamp}] [${this.source}] [${LogLevel[options.level]}] [DIFF for ${options.id}]`,
                        coloredDiff
                    );
                    // Store the new message and return early - don't show full message
                    this.previousLogs.set(options.id, message);
                    return;
                }
                // Store the new message
                this.previousLogs.set(options.id, message);
            }

            // Only show full message if we haven't shown a diff
            console.log(
                `[${timestamp}] [${this.source}] [${LogLevel[options.level]}]`,
                ...messageArgs
            );
        }
    }

    /**
     * Clear stored logs for a specific ID
     * @param id The ID to clear logs for
     */
    clearLogHistory(id: string): void {
        this.previousLogs.delete(id);
    }

    /**
     * Clear all stored log history
     */
    clearAllLogHistory(): void {
        this.previousLogs.clear();
    }
}
