import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, setSessionCookie } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { createStoredSession } from "@/lib/auth/session";
import { verifyPlatformMfaChallenge } from "@/lib/auth/platform-mfa";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({ challengeToken: z.string().min(32).max(128), code: z.string().trim().min(6).max(20) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "رمز التحقق غير صحيح" }, { status: 400 });
  const meta = await getRequestMeta();
  const challengeDigest = crypto.createHash("sha256").update(parsed.data.challengeToken).digest("hex");
  const limit = await consumeRateLimit(prisma, `platform-mfa:${challengeDigest}:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000,
    maxAttempts: 5,
    lockMs: 15 * 60_000,
  });
  if (limit.limited) {
    return NextResponse.json({ message: "محاولات كثيرة؛ سجّل الدخول من جديد" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  try {
    const admin = await verifyPlatformMfaChallenge(prisma, parsed.data.challengeToken, parsed.data.code);
    const { token } = await createStoredSession({
      prisma,
      actorType: "PLATFORM_ADMIN",
      actorId: admin.id,
      mfaVerifiedAt: new Date(),
      ...meta,
    });
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const response = NextResponse.json({ redirectTo: "/platform" });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return toErrorResponse(error, "تعذر التحقق من رمز المصادقة الثنائية");
  }
}
