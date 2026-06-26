import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashBarberPin } from "@/lib/auth/barber-pin";
import { resetBarberPinSchema } from "@/lib/auth/validation";
import { requireDashboardApi, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { toSafeBarber } from "@/lib/auth/sanitize";
import { writeAuditLog } from "@/lib/audit/audit-log";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const body = await parseJsonBody(request);
  const parsed = resetBarberPinSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "رمز الدخول يجب أن يكون 4 أو 6 أرقام" }, { status: 400 });
  }

  const before = await prisma.barber.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!before) {
    return NextResponse.json({ message: "الحلاق غير موجود" }, { status: 404 });
  }

  const barber = await prisma.barber.update({
    where: { id },
    data: { accessPinHash: await hashBarberPin(parsed.data.pin) },
  });

  const meta = await getRequestMeta();
  await writeAuditLog({
    prisma,
    organizationId: session.organizationId,
    actorType: session.role,
    actorUserId: session.user.id,
    action: "barber.pin_reset",
    entityType: "Barber",
    entityId: barber.id,
    before: toSafeBarber(before, true),
    after: toSafeBarber(barber, true),
    ...meta,
  });

  return NextResponse.json({ barber: toSafeBarber(barber, true) });
}
