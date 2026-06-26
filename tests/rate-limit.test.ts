import { afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { clearRateLimit, consumeRateLimit, purgeExpiredRateLimits } from "../lib/auth/rate-limit";

const prisma = new PrismaClient();

function key() {
  return `test:rate:${Math.random().toString(36).slice(2)}`;
}

describe("DB-backed rate limiting", () => {
  const used: string[] = [];

  afterEach(async () => {
    await Promise.all(used.map((k) => clearRateLimit(prisma, k)));
    used.length = 0;
  });

  it("allows attempts up to the limit then locks", async () => {
    const k = key();
    used.push(k);
    const now = new Date();

    for (let i = 0; i < 8; i += 1) {
      const result = await consumeRateLimit(prisma, k, now);
      expect(result.limited).toBe(false);
    }

    const locked = await consumeRateLimit(prisma, k, now);
    expect(locked.limited).toBe(true);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("clears the counter after a successful login", async () => {
    const k = key();
    used.push(k);
    const now = new Date();

    for (let i = 0; i < 9; i += 1) {
      await consumeRateLimit(prisma, k, now);
    }
    await clearRateLimit(prisma, k);

    const fresh = await consumeRateLimit(prisma, k, now);
    expect(fresh.limited).toBe(false);
  });

  it("resets the window after it expires", async () => {
    const k = key();
    used.push(k);
    const start = new Date();
    await consumeRateLimit(prisma, k, start);

    const later = new Date(start.getTime() + 6 * 60 * 1000);
    const result = await consumeRateLimit(prisma, k, later);
    expect(result.limited).toBe(false);
  });

  it("purges expired counters", async () => {
    const k = key();
    used.push(k);
    const old = new Date(Date.now() - 10 * 60 * 1000);
    await consumeRateLimit(prisma, k, old);

    const purged = await purgeExpiredRateLimits(prisma, new Date());
    expect(purged).toBeGreaterThanOrEqual(1);
  });
});
