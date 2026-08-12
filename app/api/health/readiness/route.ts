import { NextResponse } from "next/server";
import { pingRedis } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/prisma";
import { hasValidPlatformMfaEncryptionKey } from "@/lib/auth/platform-mfa";
import { isEmailConfigurationReady } from "@/lib/email/resend-email";
import { isInboundSupportReady } from "@/lib/email/platform-support";

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
  const emailConfigReady = isEmailConfigurationReady();
  const inboundSupportReady = isInboundSupportReady();
  const ready = database === "ok" && (!redisRequired || redis === "ok") && securityConfigReady && emailConfigReady && inboundSupportReady;

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
