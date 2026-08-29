type LogArgument = unknown;

const timestamp = (): string => new Date().toISOString();

export const logger = {
  info: (message: string, ...args: LogArgument[]): void => {
    console.info(`[${timestamp()}] ${message}`, ...args);
  },
  warn: (message: string, ...args: LogArgument[]): void => {
    console.warn(`[${timestamp()}] ${message}`, ...args);
  },
  error: (message: string, ...args: LogArgument[]): void => {
    console.error(`[${timestamp()}] ${message}`, ...args);
  },
};
