import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verifyAdminPassword } from "@/lib/auth/password";
import { createStoredSession } from "@/lib/auth/session";
import { setSessionCookie, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { clearRateLimit, consumeRateLimit } from "@/lib/auth/rate-limit";
import { createPlatformMfaChallenge } from "@/lib/auth/platform-mfa";

const schema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const ERROR_MESSAGE = "بيانات الدخول غير صحيحة";

export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const rateKey = `platform:${parsed.data.email}:${meta.ipAddress ?? "unknown"}`;
  const rate = await consumeRateLimit(prisma, rateKey);
  if (rate.limited) {
    return NextResponse.json(
      { message: ERROR_MESSAGE },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { email: parsed.data.email } });
  const passwordOk = admin && admin.isActive ? await verifyAdminPassword(parsed.data.password, admin.passwordHash) : false;
  if (!admin || !passwordOk) {
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  await clearRateLimit(prisma, rateKey);

  if (admin.mfaEnabledAt) {
    const challengeToken = await createPlatformMfaChallenge(prisma, admin.id, meta);
    return NextResponse.json({ requiresMfa: true, challengeToken });
  }

  const { token } = await createStoredSession({
    prisma,
    actorType: "PLATFORM_ADMIN",
    actorId: admin.id,
    mfaSetupOnly: true,
    ...meta,
  });

  const response = NextResponse.json({ redirectTo: "/platform/mfa-setup" });
  setSessionCookie(response, token);
  return response;
}
