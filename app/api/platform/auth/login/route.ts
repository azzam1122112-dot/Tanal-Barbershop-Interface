import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verifyAdminPassword } from "@/lib/auth/password";
import { createStoredSession } from "@/lib/auth/session";
import { setSessionCookie, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { clearRateLimit, consumeRateLimit } from "@/lib/auth/rate-limit";

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

  const rateKey = `platform:${parsed.data.email}`;
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

  const { token } = await createStoredSession({ prisma, actorType: "PLATFORM_ADMIN", actorId: admin.id, ...meta });
  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await clearRateLimit(prisma, rateKey);

  const response = NextResponse.json({ redirectTo: "/platform" });
  setSessionCookie(response, token);
  return response;
}
