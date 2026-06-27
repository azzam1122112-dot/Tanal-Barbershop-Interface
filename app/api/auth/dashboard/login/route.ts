import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyAdminPassword } from "@/lib/auth/password";
import { dashboardLoginSchema } from "@/lib/auth/validation";
import { createStoredSession } from "@/lib/auth/session";
import { setSessionCookie, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { clearRateLimit, consumeRateLimit } from "@/lib/auth/rate-limit";
import { canAdminLogin } from "@/lib/auth/login-policy";
import { getKnownLoginOrgSlug } from "@/lib/tenant/request-org";

const ERROR_MESSAGE = "بيانات الدخول غير صحيحة";
const ORG_NOT_FOUND_MESSAGE = "لم نجد مؤسسة بهذا المعرّف. تأكد من كتابة معرّف مؤسستك كما اخترته عند التسجيل.";
const RATE_LIMITED_MESSAGE = "محاولات كثيرة. يرجى المحاولة بعد قليل.";
const NEEDS_ORG_MESSAGE = "بريدك مسجّل في أكثر من مؤسسة. أدخل معرّف المؤسسة للمتابعة.";
const ADMIN_LOGIN_ROLES = ["OWNER", "ADMIN", "SUPERVISOR"] as const;

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = dashboardLoginSchema.safeParse(body);
  const meta = await getRequestMeta();

  if (!parsed.success) {
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const email = parsed.data.email;
  const rateKey = `dashboard:${email}`;
  const rate = await consumeRateLimit(prisma, rateKey);
  if (rate.limited) {
    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "auth.dashboard_login_rate_limited",
      entityType: "User",
      after: { email, retryAfterSeconds: rate.retryAfterSeconds },
      ...meta,
    });
    return NextResponse.json(
      { message: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  // المؤسسة معروفة من النطاق الفرعي أو المعرّف المُدخل؛ وإلا نحلّها من البريد نفسه.
  const knownSlug = await getKnownLoginOrgSlug(parsed.data.organizationSlug);
  let organization = null;
  if (knownSlug) {
    organization = await prisma.organization.findUnique({ where: { slug: knownSlug } });
    if (!organization) {
      return NextResponse.json({ message: ORG_NOT_FOUND_MESSAGE }, { status: 404 });
    }
  } else {
    const candidates = await prisma.user.findMany({
      where: { email, isActive: true, role: { in: [...ADMIN_LOGIN_ROLES] }, organizationId: { not: null } },
      select: { organizationId: true },
      distinct: ["organizationId"],
    });
    if (candidates.length > 1) {
      return NextResponse.json({ message: NEEDS_ORG_MESSAGE, needsOrganization: true }, { status: 409 });
    }
    organization = candidates[0]?.organizationId
      ? await prisma.organization.findUnique({ where: { id: candidates[0].organizationId } })
      : null;
  }

  const user = organization
    ? await prisma.user.findFirst({ where: { email, organizationId: organization.id } })
    : null;
  const passwordOk = user ? await verifyAdminPassword(parsed.data.password, user.passwordHash) : false;

  if (!user || !organization || !canAdminLogin(user, passwordOk)) {
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

  // أول صالون في المؤسسة هو الصالون النشط افتراضيًا (يمكن تبديله لاحقًا).
  const firstSalon = authenticatedUser.organizationId
    ? await prisma.salon.findFirst({
        where: { organizationId: authenticatedUser.organizationId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
    : null;

  const { token } = await createStoredSession({
    prisma,
    actorType: authenticatedUser.role,
    actorId: authenticatedUser.id,
    role: authenticatedUser.role,
    organizationId: authenticatedUser.organizationId,
    activeSalonId: firstSalon?.id ?? null,
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

  await clearRateLimit(prisma, rateKey);
  const response = NextResponse.json({ redirectTo: "/dashboard" });
  setSessionCookie(response, token);
  return response;
}
