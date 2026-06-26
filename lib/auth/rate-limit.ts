import type { Prisma, PrismaClient } from "@prisma/client";

type RateLimitPrisma = PrismaClient | Prisma.TransactionClient;

// نافذة العد للمحاولات الفاشلة المتتابعة.
const WINDOW_MS = 5 * 60 * 1000;
// أقصى عدد محاولات مسموح بها داخل النافذة قبل القفل.
const MAX_ATTEMPTS = 8;
// مدة القفل بعد تجاوز الحد الأقصى.
const LOCK_MS = 15 * 60 * 1000;

export type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

/**
 * يسجّل محاولة دخول جديدة لمفتاح معيّن ويعيد ما إذا كان يجب رفضها.
 * مخزّن في قاعدة البيانات حتى يصمد القفل عبر عدة instances وإعادة التشغيل.
 */
export async function consumeRateLimit(
  prisma: RateLimitPrisma,
  key: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const existing = await prisma.loginAttempt.findUnique({ where: { key } });

  if (existing?.lockedUntil && existing.lockedUntil > now) {
    return { limited: true, retryAfterSeconds: secondsUntil(existing.lockedUntil, now) };
  }

  const windowExpired = !existing || now.getTime() - existing.windowStart.getTime() > WINDOW_MS;

  if (windowExpired) {
    await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now, lockedUntil: null },
      update: { count: 1, windowStart: now, lockedUntil: null },
    });
    return { limited: false, retryAfterSeconds: 0 };
  }

  const nextCount = existing.count + 1;
  const exceeded = nextCount > MAX_ATTEMPTS;
  const lockedUntil = exceeded ? new Date(now.getTime() + LOCK_MS) : null;

  await prisma.loginAttempt.update({
    where: { key },
    data: { count: nextCount, lockedUntil },
  });

  return {
    limited: exceeded,
    retryAfterSeconds: exceeded ? Math.ceil(LOCK_MS / 1000) : 0,
  };
}

/** يمسح عداد المحاولات بعد نجاح الدخول. */
export async function clearRateLimit(prisma: RateLimitPrisma, key: string) {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}

/** يحذف صفوف المحاولات المنتهية والقفل المنقضي. للصيانة الدورية. */
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

function secondsUntil(target: Date, now: Date) {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
}
