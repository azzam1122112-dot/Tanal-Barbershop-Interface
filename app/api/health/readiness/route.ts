import { NextResponse } from "next/server";
import { pingRedis } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/prisma";
import { hasValidPlatformMfaEncryptionKey } from "@/lib/auth/platform-mfa";

export const dynamic = "force-dynamic";

export async function GET() {
  const [database, redis] = await Promise.all([
    prisma.$queryRaw`SELECT 1`
      .then(() => "ok" as const)
      .catch(() => "unavailable" as const),
    pingRedis(),
  ]);
  const redisRequired = process.env.REDIS_REQUIRED === "true";
  const securityConfigReady = process.env.NODE_ENV !== "production" || hasValidPlatformMfaEncryptionKey();
  const ready = database === "ok" && (!redisRequired || redis === "ok") && securityConfigReady;

  return NextResponse.json(
    {
      status: ready ? "ready" : "unavailable",
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
