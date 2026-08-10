import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashBarberPin } from "@/lib/auth/barber-pin";
import { createBarberSchema } from "@/lib/auth/validation";
import { requireBarberAdminApi, requireBarberOversightApi, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { salonScopeWhere } from "@/lib/auth/salon-scope";
import { toSafeBarber } from "@/lib/auth/sanitize";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { BusinessError } from "@/lib/errors";
import { toErrorResponse } from "@/lib/http/error-response";
import { lockTenantQuota } from "@/lib/db/tenant-lock";

export async function GET() {
  const auth = await requireBarberOversightApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const barbers = await prisma.barber.findMany({
    where: { organizationId: session.organizationId, ...salonScopeWhere(session) },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ barbers: barbers.map((barber) => toSafeBarber(barber, true)) });
}

export async function POST(request: Request) {
  const auth = await requireBarberAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const body = await parseJsonBody(request);
  const parsed = createBarberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الحلاق غير صحيحة" }, { status: 400 });
  }

  try {
    const pinHash = await hashBarberPin(parsed.data.pin);
    const meta = await getRequestMeta();
    const barber = await prisma.$transaction(async (tx) => {
      await lockTenantQuota(tx, session.organizationId, "barbers");
      const organization = await tx.organization.findUnique({
        where: { id: session.organizationId },
        include: { plan: true, _count: { select: { barbers: true } } },
      });
      if (!organization) throw new BusinessError("المؤسسة غير موجودة");
      const maxBarbers = organization.plan?.maxBarbers ?? null;
      if (maxBarbers !== null && organization._count.barbers >= maxBarbers) {
        throw new BusinessError(`باقتك تسمح بـ ${maxBarbers} حلاق. رقّ باقتك لإضافة حلاقين أكثر.`);
      }
      const salon = await tx.salon.findFirst({
        where: { id: parsed.data.salonId, organizationId: session.organizationId, isActive: true }, select: { id: true },
      });
      if (!salon) throw new BusinessError("الفرع غير موجود");
      const created = await tx.barber.create({ data: {
        organizationId: session.organizationId, salonId: salon.id, name: parsed.data.name,
        phone: parsed.data.phone, accessPinHash: pinHash, isActive: true,
        commissionEnabled: parsed.data.commissionEnabled, commissionRate: parsed.data.commissionRate,
      } });
      await writeAuditLog({ prisma: tx, organizationId: session.organizationId, actorType: session.role,
        actorUserId: session.user.id, action: "barber.created", entityType: "Barber", entityId: created.id,
        after: toSafeBarber(created, true), ...meta });
      return created;
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ barber: toSafeBarber(barber, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "رقم الجوال مستخدم مسبقًا" }, { status: 409 });
    }

    return toErrorResponse(error, "تعذر إنشاء الحلاق");
  }
}
