import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyAdminPassword } from "@/lib/auth/password";
import { dashboardLoginSchema } from "@/lib/auth/validation";
import { createStoredSession } from "@/lib/auth/session";
import { setSessionCookie, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { clearRateLimit, isRateLimited } from "@/lib/auth/rate-limit";
import { canAdminLogin } from "@/lib/auth/login-policy";

const ERROR_MESSAGE = "بيانات الدخول غير صحيحة";

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = dashboardLoginSchema.safeParse(body);
  const meta = await getRequestMeta();

  if (!parsed.success) {
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const rateKey = `dashboard:${parsed.data.email}`;
  if (isRateLimited(rateKey)) {
    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "auth.dashboard_login_rate_limited",
      entityType: "User",
      after: { email: parsed.data.email },
      ...meta,
    });
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const passwordOk = user ? await verifyAdminPassword(parsed.data.password, user.passwordHash) : false;

  if (!user || !canAdminLogin(user, passwordOk)) {
    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "auth.dashboard_login_failed",
      entityType: "User",
      after: { email: parsed.data.email },
      ...meta,
    });
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const authenticatedUser = user;

  const { token } = await createStoredSession({
    prisma,
    actorType: authenticatedUser.role,
    actorId: authenticatedUser.id,
    role: authenticatedUser.role,
    ...meta,
  });

  await prisma.user.update({
    where: { id: authenticatedUser.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAuditLog({
    prisma,
    actorType: authenticatedUser.role,
    actorUserId: authenticatedUser.id,
    action: "auth.dashboard_login_success",
    entityType: "User",
    entityId: authenticatedUser.id,
    ...meta,
  });

  clearRateLimit(rateKey);
  const response = NextResponse.json({ redirectTo: "/dashboard" });
  setSessionCookie(response, token);
  return response;
}
