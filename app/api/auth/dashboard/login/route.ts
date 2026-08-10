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
import { resolveLoginIdentity } from "@/lib/auth/login-resolver";

const ERROR_MESSAGE = "بيانات الدخول غير صحيحة";
const ORG_NOT_FOUND_MESSAGE = "لم نجد مؤسسة بهذا المعرّف. تأكد من كتابة معرّف مؤسستك كما اخترته عند التسجيل.";
const RATE_LIMITED_MESSAGE = "محاولات كثيرة. يرجى المحاولة بعد قليل.";
const NEEDS_ORG_MESSAGE = "بريدك مسجّل في أكثر من صالون. اختر الصالون للمتابعة.";
const ADMIN_LOGIN_ROLES = ["OWNER", "ADMIN", "SUPERVISOR"] as const;

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = dashboardLoginSchema.safeParse(body);
  const meta = await getRequestMeta();

  if (!parsed.success) {
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const email = parsed.data.email;
  const rateKey = `dashboard:${email}:${meta.ipAddress ?? "unknown"}`;
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

  // لا نطلب معرّف مؤسسة من المستخدم إطلاقًا: النطاق الفرعي إن وُجد، وإلا نحلّها
  // من البريد وكلمة المرور معًا، وعند التكرار نعرض أسماء الصالونات للاختيار.
  const hostSlug = await getKnownLoginOrgSlug();
  const scopedOrganizationId = hostSlug
    ? (await prisma.organization.findUnique({ where: { slug: hostSlug }, select: { id: true } }))?.id
    : parsed.data.organizationId;

  if (hostSlug && !scopedOrganizationId) {
    return NextResponse.json({ message: ORG_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const candidates = await prisma.user.findMany({
    where: {
      email,
      isActive: true,
      role: { in: [...ADMIN_LOGIN_ROLES] },
      organizationId: scopedOrganizationId,
      organization: { status: "ACTIVE" },
    },
    include: { organization: { select: { id: true, name: true } } },
  });

  const resolution = await resolveLoginIdentity(
    candidates,
    (candidate) => verifyAdminPassword(parsed.data.password, candidate.passwordHash),
    (candidate) => ({ id: candidate.organization.id, name: candidate.organization.name }),
  );

  if (resolution.outcome === "NEEDS_CHOICE") {
    // كلمة المرور صحيحة في أكثر من صالون — يختار صاحبها أيّها يريد بالاسم.
    return NextResponse.json(
      { message: NEEDS_ORG_MESSAGE, needsOrganizationChoice: true, organizations: resolution.organizations },
      { status: 409 },
    );
  }

  const user = resolution.outcome === "SINGLE" ? resolution.identity : null;
  const organization = user?.organization ?? null;
  const passwordOk = Boolean(user);

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
