import { createClient, type RedisClientType } from "redis";
import { logger } from "@/lib/logger";

type RedisState = {
  client?: RedisClientType;
  connecting?: Promise<RedisClientType | null>;
  retryAfter?: number;
  lastLoggedAt?: number;
};

const globalForRedis = globalThis as typeof globalThis & {
  xmansxRedis?: RedisState;
};

const state = globalForRedis.xmansxRedis ?? {};
globalForRedis.xmansxRedis = state;

const RETRY_DELAY_MS = 10_000;
const ERROR_LOG_INTERVAL_MS = 60_000;

function redisUrl() {
  return process.env.REDIS_URL?.trim() || null;
}

export function redisKey(...parts: Array<string | number>) {
  const prefix = process.env.REDIS_KEY_PREFIX?.trim() || "xmansx";
  return [prefix, ...parts].join(":");
}

/**
 * اتصال Redis كسول واختياري: التطوير والاختبارات يواصلان العمل عبر PostgreSQL،
 * بينما تستخدم كل نسخ التطبيق الاتصال المشترك نفسه عند ضبط REDIS_URL في الإنتاج.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = redisUrl();
  if (!url) return null;
  if (state.client?.isReady) return state.client;
  if (state.connecting) return state.connecting;
  if (state.retryAfter && state.retryAfter > Date.now()) return null;

  state.connecting = (async () => {
    const client = state.client ?? createClient({
      url,
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: false,
      },
    });

    if (!state.client) {
      client.on("error", (error) => logRedisError("Redis connection error", error));
      state.client = client;
    }

    try {
      if (!client.isOpen) await client.connect();
      state.retryAfter = undefined;
      return client;
    } catch (error) {
      state.retryAfter = Date.now() + RETRY_DELAY_MS;
      logRedisError("Redis unavailable; falling back to PostgreSQL", error);
      return null;
    } finally {
      state.connecting = undefined;
    }
  })();

  return state.connecting;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    logRedisError("Redis cache read failed", error);
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number) {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    await redis.set(key, JSON.stringify(value), { EX: Math.max(1, Math.trunc(ttlSeconds)) });
    return true;
  } catch (error) {
    logRedisError("Redis cache write failed", error);
    return false;
  }
}

export async function deleteCachedKeys(keys: string[]) {
  if (keys.length === 0) return;
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(keys);
  } catch (error) {
    logRedisError("Redis cache invalidation failed", error);
  }
}

export async function pingRedis() {
  const redis = await getRedisClient();
  if (!redis) return redisUrl() ? "unavailable" as const : "disabled" as const;
  try {
    return (await redis.ping()) === "PONG" ? "ok" as const : "unavailable" as const;
  } catch (error) {
    logRedisError("Redis health check failed", error);
    return "unavailable" as const;
  }
}

function logRedisError(message: string, error: unknown) {
  const now = Date.now();
  if (state.lastLoggedAt && now - state.lastLoggedAt < ERROR_LOG_INTERVAL_MS) return;
  state.lastLoggedAt = now;
  logger.warn(message, error instanceof Error ? { name: error.name, message: error.message } : error);
}
