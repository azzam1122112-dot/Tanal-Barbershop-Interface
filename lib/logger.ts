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
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

/**
 * مُسجّل JSON منظّم بسيط بدون اعتماديات خارجية.
 * يكتب سطرًا واحدًا لكل حدث ليسهل تجميعه في الإنتاج (Render logs).
 */
function emit(level: LogLevel, message: string, context?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const payload: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    message,
  };

  if (context !== undefined) {
    payload.context = level === "error" ? serializeError(context) : context;
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
