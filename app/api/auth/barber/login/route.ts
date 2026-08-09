import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyBarberPin } from "@/lib/auth/barber-pin";
import { barberLoginSchema } from "@/lib/auth/validation";
import { createStoredSession } from "@/lib/auth/session";
import { setSessionCookie, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { clearRateLimit, consumeRateLimit } from "@/lib/auth/rate-limit";
import { canBarberLogin } from "@/lib/auth/login-policy";
import { getKnownLoginOrgSlug } from "@/lib/tenant/request-org";
import { resolveLoginIdentity } from "@/lib/auth/login-resolver";

const ERROR_MESSAGE = "رقم الجوال أو رمز الدخول غير صحيح";
const ORG_NOT_FOUND_MESSAGE = "لم نجد مؤسسة بهذا المعرّف. تأكد من كتابة معرّف صالونك بشكل صحيح.";
const RATE_LIMITED_MESSAGE = "محاولات كثيرة. يرجى المحاولة بعد قليل.";
const NEEDS_ORG_MESSAGE = "رقمك مسجّل في أكثر من صالون. اختر صالونك للمتابعة.";

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = barberLoginSchema.safeParse(body);
  const meta = await getRequestMeta();

  if (!parsed.success) {
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const phone = parsed.data.phone;
  const rateKey = `barber:${phone}`;
  const rate = await consumeRateLimit(prisma, rateKey);
  if (rate.limited) {
    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "auth.barber_login_rate_limited",
      entityType: "Barber",
      after: { phone, retryAfterSeconds: rate.retryAfterSeconds },
      ...meta,
    });
    return NextResponse.json(
      { message: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  // لا معرّف مؤسسة يُطلب من الحلاق: النطاق الفرعي إن وُجد، وإلا نحلّها من
  // الجوال ورمز الدخول معًا، وعند التكرار يختار صالونه بالاسم.
  const hostSlug = await getKnownLoginOrgSlug();
  const scopedOrganizationId = hostSlug
    ? (await prisma.organization.findUnique({ where: { slug: hostSlug }, select: { id: true } }))?.id
    : parsed.data.organizationId;

  if (hostSlug && !scopedOrganizationId) {
    return NextResponse.json({ message: ORG_NOT_FOUND_MESSAGE }, { status: 404 });
  }

  const candidates = await prisma.barber.findMany({
    where: {
      phone,
      isActive: true,
      organizationId: scopedOrganizationId ? scopedOrganizationId : { not: null },
      organization: { status: "ACTIVE" },
    },
    include: { organization: { select: { id: true, name: true } } },
  });

  const resolution = await resolveLoginIdentity(
    candidates,
    (candidate) => verifyBarberPin(parsed.data.pin, candidate.accessPinHash),
    (candidate) => (candidate.organization ? { id: candidate.organization.id, name: candidate.organization.name } : null),
  );

  if (resolution.outcome === "NEEDS_CHOICE") {
    return NextResponse.json(
      { message: NEEDS_ORG_MESSAGE, needsOrganizationChoice: true, organizations: resolution.organizations },
      { status: 409 },
    );
  }

  const barber = resolution.outcome === "SINGLE" ? resolution.identity : null;
  const organization = barber?.organization ?? null;
  const pinOk = Boolean(barber);

  if (!barber || !organization || !canBarberLogin(barber, pinOk)) {
    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "auth.barber_login_failed",
      entityType: "Barber",
      after: { phone },
      ...meta,
    });
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const authenticatedBarber = barber;

  const { token } = await createStoredSession({
    prisma,
    actorType: "BARBER",
    actorId: authenticatedBarber.id,
    role: "BARBER",
    organizationId: authenticatedBarber.organizationId,
    activeSalonId: authenticatedBarber.salonId,
    ...meta,
  });

  await prisma.barber.update({
    where: { id: authenticatedBarber.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAuditLog({
    prisma,
    actorType: "BARBER",
    actorBarberId: authenticatedBarber.id,
    action: "auth.barber_login_success",
    entityType: "Barber",
    entityId: authenticatedBarber.id,
    ...meta,
  });

  await clearRateLimit(prisma, rateKey);
  const response = NextResponse.json({ redirectTo: "/barber" });
  setSessionCookie(response, token);
  return response;
}
