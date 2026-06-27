import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { updateBarberSchema } from "@/lib/auth/validation";
import { requireDashboardApi, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { toSafeBarber } from "@/lib/auth/sanitize";
import { writeAuditLog } from "@/lib/audit/audit-log";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const body = await parseJsonBody(request);
  const parsed = updateBarberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الحلاق غير صحيحة" }, { status: 400 });
  }

  const before = await prisma.barber.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!before) {
    return NextResponse.json({ message: "الحلاق غير موجود" }, { status: 404 });
  }

  if (parsed.data.salonId && parsed.data.salonId !== before.salonId) {
    const salon = await prisma.salon.findFirst({
      where: { id: parsed.data.salonId, organizationId: session.organizationId, isActive: true },
      select: { id: true },
    });
    if (!salon) {
      return NextResponse.json({ message: "الفرع غير موجود" }, { status: 404 });
    }
  }

  try {
    const barber = await prisma.barber.update({
      where: { id },
      data: parsed.data,
    });

    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action: before.isActive && parsed.data.isActive === false ? "barber.disabled" : "barber.updated",
      entityType: "Barber",
      entityId: barber.id,
      before: toSafeBarber(before, true),
      after: toSafeBarber(barber, true),
      ...meta,
    });

    return NextResponse.json({ barber: toSafeBarber(barber, true) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "رقم الجوال مستخدم مسبقًا" }, { status: 409 });
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const before = await prisma.barber.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!before) {
    return NextResponse.json({ message: "الحلاق غير موجود" }, { status: 404 });
  }

  const [visitsCount, dailyClosesCount, cashSessionsCount, customersCount] = await prisma.$transaction([
    prisma.visit.count({ where: { barberId: id } }),
    prisma.dailyClose.count({ where: { barberId: id } }),
    prisma.cashSession.count({ where: { barberId: id } }),
    prisma.customer.count({ where: { createdByBarberId: id } }),
  ]);

  if (visitsCount + dailyClosesCount + cashSessionsCount + customersCount > 0) {
    return NextResponse.json(
      { message: "لا يمكن حذف الحلاق لوجود زيارات أو بيانات مرتبطة به. يمكنك تعطيل الحساب بدل الحذف." },
      { status: 409 },
    );
  }

  try {
    await prisma.barber.delete({ where: { id } });

    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "barber.deleted",
      entityType: "Barber",
      entityId: id,
      before: toSafeBarber(before, true),
      after: null,
      ...meta,
    });

    return NextResponse.json({ message: "تم حذف الحلاق" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { message: "لا يمكن حذف الحلاق لوجود بيانات مرتبطة به. يمكنك تعطيل الحساب بدل الحذف." },
        { status: 409 },
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ message: "الحلاق غير موجود" }, { status: 404 });
    }

    throw error;
  }
}
