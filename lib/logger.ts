type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): LogLevel {
  const env = process.env.LOG_LEVEL as LogLevel | undefined;
  if (env && env in LEVEL_ORDER) return env;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactString(error.message),
      ...(process.env.NODE_ENV === "production" ? {} : { stack: redactString(error.stack ?? "") }),
    };
  }
  return redactForLog(error);
}

const SENSITIVE_KEY = /(password|passphrase|secret|token|authorization|cookie|session|otp|pin|api[-_]?key|private[-_]?key)/i;

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactForLog(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactForLog(item, depth + 1),
    ]),
  );
}

function redactString(value: string) {
  return value
    .replace(/(bearer\s+)[a-z0-9._~+\/-]+/gi, "$1[REDACTED]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/([\w.+-])[\w.+-]*@([\w-]+\.[\w.-]+)/g, "$1***@$2")
    .replace(/\b(?:\+?966|0)?5\d{8}\b/g, (phone) => `${phone.slice(0, 3)}***${phone.slice(-3)}`);
}

/**
 * مُسجّل JSON منظّم بسيط بدون اعتماديات خارجية.
 * يكتب سطرًا واحدًا لكل حدث ليسهل تجميعه في الإنتاج بأي مجمّع سجلات.
 */
function emit(level: LogLevel, message: string, context?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const payload: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
  };

  if (context !== undefined) {
    payload.context = level === "error" ? serializeError(context) : redactForLog(context);
  }

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: unknown) => emit("debug", message, context),
  info: (message: string, context?: unknown) => emit("info", message, context),
  warn: (message: string, context?: unknown) => emit("warn", message, context),
  error: (message: string, context?: unknown) => emit("error", message, context),
};
