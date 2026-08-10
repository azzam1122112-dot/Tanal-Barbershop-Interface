import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { deleteCachedKeys, getRedisClient, redisKey } from "@/lib/cache/redis";

type RateLimitPrisma = PrismaClient | Prisma.TransactionClient;

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;

export type RateLimitPolicy = {
  windowMs: number;
  maxAttempts: number;
  lockMs: number;
};

const DEFAULT_POLICY: RateLimitPolicy = { windowMs: WINDOW_MS, maxAttempts: MAX_ATTEMPTS, lockMs: LOCK_MS };

export type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

/**
 * Redis هو المسار الإنتاجي: سكربت Lua يجعل الزيادة والقفل عملية ذرية عبر كل
 * نسخ التطبيق. عند غيابه يستمر النظام ببديل PostgreSQL ذري وآمن للتطوير.
 */
export async function consumeRateLimit(
  prisma: RateLimitPrisma,
  key: string,
  now?: Date,
  policy: RateLimitPolicy = DEFAULT_POLICY,
): Promise<RateLimitResult> {
  // الاختبارات تمرّر وقتًا مصطنعًا؛ Redis يعتمد TTL حقيقيًا، لذلك تبقى
  // حتمية الاختبار على PostgreSQL. طلبات الإنتاج لا تمرّر `now`.
  if (!now) {
    const redisResult = await consumeRedisRateLimit(key, policy);
    if (redisResult) return redisResult;
  }

  return consumeDatabaseRateLimit(prisma, protectedStorageKey(key), now ?? new Date(), policy);
}

/** يمسح المصدرين حتى لا يعود عداد قديم عند تعطل Redis أو استعادته. */
export async function clearRateLimit(prisma: RateLimitPrisma, key: string) {
  const keys = rateLimitRedisKeys(key);
  await Promise.all([
    prisma.loginAttempt.deleteMany({ where: { key: protectedStorageKey(key) } }),
    deleteCachedKeys([keys.counter, keys.lock]),
  ]);
}

/** Redis ينظف نفسه عبر TTL؛ هذه الصيانة تخص بديل PostgreSQL فقط. */
export async function purgeExpiredRateLimits(prisma: RateLimitPrisma, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  const result = await prisma.loginAttempt.deleteMany({
    where: {
      windowStart: { lt: cutoff },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
  });
  return result.count;
}

async function consumeRedisRateLimit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  const keys = rateLimitRedisKeys(key);
  const script = `
    local lockTtl = redis.call('TTL', KEYS[2])
    if lockTtl > 0 then
      return {1, lockTtl}
    end

    local count = redis.call('INCR', KEYS[1])
    if count == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end

    if count > tonumber(ARGV[2]) then
      redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
      redis.call('DEL', KEYS[1])
      return {1, tonumber(ARGV[3])}
    end

    return {0, 0}
  `;

  try {
    const result = await redis.eval(script, {
      keys: [keys.counter, keys.lock],
      arguments: [
        String(Math.ceil(policy.windowMs / 1000)),
        String(policy.maxAttempts),
        String(Math.ceil(policy.lockMs / 1000)),
      ],
    }) as unknown as [number, number];
    return { limited: Number(result[0]) === 1, retryAfterSeconds: Number(result[1]) };
  } catch {
    return null;
  }
}

/**
 * الزيادة في PostgreSQL ذرية. إعادة النافذة مشروطة بتاريخها، لذلك أول طلب
 * متزامن فقط يعيدها ثم تتراكم بقية الزيادات بلا فقد.
 */
async function consumeDatabaseRateLimit(
  prisma: RateLimitPrisma,
  key: string,
  now: Date,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, count: 0, windowStart: now, lockedUntil: null },
    update: {},
  });

  const cutoff = new Date(now.getTime() - policy.windowMs);
  await prisma.loginAttempt.updateMany({
    where: { key, windowStart: { lt: cutoff } },
    data: { count: 0, windowStart: now, lockedUntil: null },
  });

  const attempt = await prisma.loginAttempt.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    return { limited: true, retryAfterSeconds: secondsUntil(attempt.lockedUntil, now) };
  }
  if (attempt.count <= policy.maxAttempts) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const lockedUntil = new Date(now.getTime() + policy.lockMs);
  await prisma.loginAttempt.update({ where: { key }, data: { lockedUntil } });
  return { limited: true, retryAfterSeconds: Math.ceil(policy.lockMs / 1000) };
}

function protectedStorageKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function rateLimitRedisKeys(key: string) {
  const digest = crypto.createHash("sha256").update(key).digest("hex");
  return {
    counter: redisKey("rate-limit", digest, "count"),
    lock: redisKey("rate-limit", digest, "lock"),
  };
}

function secondsUntil(target: Date, now: Date) {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
}
