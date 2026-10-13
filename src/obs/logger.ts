import type { TraceEvent } from "../agents/types.js";

export type LogLevel = "info" | "warn" | "error";

/** Only primitives: domain objects cannot be dumped into a log line by type. */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export type Logger = Record<LogLevel, (event: string, fields?: LogFields) => void>;

export type LogEntry = { ts: string; level: LogLevel; event: string } & LogFields;

export type LoggerOptions = {
  out?: (line: string) => void;
  err?: (line: string) => void;
  now?: () => Date;
};

const ERROR_MESSAGE_MAX = 200;

/** One JSON object per line; undefined fields are dropped by JSON.stringify. */
export const formatLogLine = (entry: LogEntry): string => JSON.stringify(entry);

export const errorMeta = (error: unknown): LogFields => {
  const name = error instanceof Error ? error.name : typeof error;
  const raw = error instanceof Error ? error.message : String(error);
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  return { errorName: name, errorMessage: firstLine.slice(0, ERROR_MESSAGE_MAX) };
};

/** Whitelist of trace metadata: never content, args values or LLM/provider reasons. */
export const traceEventMeta = (event: TraceEvent, seq: number): LogFields => {
  const base: LogFields = { seq, node: event.node, type: event.type };
  switch (event.type) {
    case "thought":
    case "observation":
    case "critique":
    case "answer":
    case "summarize":
      return { ...base, chars: event.content.length };
    case "action":
      return { ...base, tool: event.tool, argKeys: Object.keys(event.args ?? {}).length };
    case "plan":
      return { ...base, steps: event.steps.length };
    case "route":
      return { ...base, route: event.route };
    case "fallback":
      return { ...base, fromModel: event.fromModel, toModel: event.toModel };
    default:
      return base;
  }
};

export const createLogger = (options: LoggerOptions = {}): Logger => {
  const out = options.out ?? ((line: string) => process.stdout.write(line));
  const err = options.err ?? ((line: string) => process.stderr.write(line));
  const now = options.now ?? (() => new Date());

  const write = (level: LogLevel) => (event: string, fields: LogFields = {}) => {
    const { ts: _ts, level: _level, event: _event, ...rest } = fields;
    const line = `${formatLogLine({ ts: now().toISOString(), level, event, ...rest })}\n`;
    (level === "info" ? out : err)(line);
  };

  return { info: write("info"), warn: write("warn"), error: write("error") };
};
