import { createLogger, type Logger } from "./logger.js";

export const TEST_LOG_TS = "2026-10-13T00:00:00.000Z";

/** Logger whose lines (stdout and stderr) are kept in memory for assertions. */
export const createCapturingLogger = (): {
  logger: Logger;
  lines: string[];
  entries: () => Array<Record<string, unknown>>;
} => {
  const lines: string[] = [];
  const capture = (line: string) => {
    lines.push(line);
  };
  const logger = createLogger({ out: capture, err: capture, now: () => new Date(TEST_LOG_TS) });
  return {
    logger,
    lines,
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
};
