import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyBarberPin } from "@/lib/auth/barber-pin";
import { barberLoginSchema } from "@/lib/auth/validation";
import { createStoredSession } from "@/lib/auth/session";
import { setSessionCookie, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { clearRateLimit, isRateLimited } from "@/lib/auth/rate-limit";
import { canBarberLogin } from "@/lib/auth/login-policy";

const ERROR_MESSAGE = "رقم الجوال أو رمز الدخول غير صحيح";

export async function POST(request: Request) {
  const body = await parseJsonBody(request);
  const parsed = barberLoginSchema.safeParse(body);
  const meta = await getRequestMeta();

  if (!parsed.success) {
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 401 });
  }

  const rateKey = `barber:${parsed.data.phone}`;
  if (isRateLimited(rateKey)) {
    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "auth.barber_login_rate_limited",
      entityType: "Barber",
      after: { phone: parsed.data.phone },
      ...meta,
    });
    return NextResponse.json({ message: ERROR_MESSAGE }, { status: 429 });
  }

  const barber = await prisma.barber.findUnique({ where: { phone: parsed.data.phone } });
  const pinOk = barber ? await verifyBarberPin(parsed.data.pin, barber.accessPinHash) : false;

  if (!barber || !canBarberLogin(barber, pinOk)) {
    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "auth.barber_login_failed",
      entityType: "Barber",
      after: { phone: parsed.data.phone },
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

  clearRateLimit(rateKey);
  const response = NextResponse.json({ redirectTo: "/barber" });
  setSessionCookie(response, token);
  return response;
}
