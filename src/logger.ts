enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private level: LogLevel;
  public name: string;

  constructor(name: string, level: LogLevel = LogLevel.INFO) {
    this.name = name;
    this.level = level;
  }

  debug(...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(...args);
    }
  }

  info(...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(...args);
    }
  }

  warn(...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(...args);
    }
  }

  error(...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(...args);
    }
  }

  setLevel(level: string): void {
    if (Object.values(LogLevel).includes(level as LogLevel)) {
      this.level = level as LogLevel;
    } else {
      console.error(`Invalid log level: ${level}`);
    }
  }
}

export default Logger;

/** Shared logger instance used by the SDK. Callers can set its log level to silence or unmute output. */
export const log: Logger = new Logger('scrapfly');
