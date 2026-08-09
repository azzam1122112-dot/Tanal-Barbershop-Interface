import type { Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

type AttendancePrisma = PrismaClient | Prisma.TransactionClient;

/**
 * حضور وانصراف الحلاق — سجل إداري مستقل عن جلسة الصندوق.
 * الجلسة أداة مالية (متى فُتح الدرج)، والحضور أداة موارد بشرية (متى داوم).
 * الفصل مقصود: حلاق قد يداوم بلا صندوق (تدريب/جرد) والعكس غير مسموح تشغيليًا.
 */
export async function getOpenAttendance(prisma: AttendancePrisma, barberId: string) {
  return prisma.attendanceRecord.findFirst({
    where: { barberId, checkOutAt: null },
    orderBy: { checkInAt: "desc" },
  });
}

export async function checkIn(
  prisma: PrismaClient,
  input: { organizationId: string; salonId: string; barberId: string; source?: "SELF" | "MANAGER"; notes?: string | null },
) {
  const open = await getOpenAttendance(prisma, input.barberId);
  if (open) {
    // تسجيل حضور مكرر لا يفتح سجلًا ثانيًا — نعيد القائم فيبقى اليوم صفًا واحدًا.
    return { record: toAttendanceRow(open), alreadyOpen: true };
  }

  const record = await prisma.attendanceRecord.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      barberId: input.barberId,
      source: input.source ?? "SELF",
      notes: input.notes?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      actorType: input.source === "MANAGER" ? "ADMIN" : "BARBER",
      actorBarberId: input.source === "MANAGER" ? null : input.barberId,
      action: "attendance.check_in",
      entityType: "AttendanceRecord",
      entityId: record.id,
      after: { barberId: input.barberId, checkInAt: record.checkInAt.toISOString() },
    },
  });

  return { record: toAttendanceRow(record), alreadyOpen: false };
}

export async function checkOut(
  prisma: PrismaClient,
  input: { organizationId: string; barberId: string; notes?: string | null },
) {
  const open = await getOpenAttendance(prisma, input.barberId);
  if (!open) throw new BusinessError("لا يوجد تسجيل حضور مفتوح");

  const record = await prisma.attendanceRecord.update({
    where: { id: open.id },
    data: { checkOutAt: new Date(), ...(input.notes ? { notes: input.notes.trim() } : {}) },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      salonId: record.salonId,
      actorType: "BARBER",
      actorBarberId: input.barberId,
      action: "attendance.check_out",
      entityType: "AttendanceRecord",
      entityId: record.id,
      after: { checkOutAt: record.checkOutAt?.toISOString() ?? null, minutes: minutesWorked(record) },
    },
  });

  return toAttendanceRow(record);
}

export async function getAttendanceReport(
  prisma: AttendancePrisma,
  filters: { organizationId: string; salonIds?: string[] | null; from?: Date | string | null; to?: Date | string | null; barberId?: string | null },
) {
  const from = filters.from ? startOfDay(filters.from) : startOfMonth();
  const to = filters.to ? endExclusive(filters.to) : endExclusive(new Date());

  const records = await prisma.attendanceRecord.findMany({
    where: {
      organizationId: filters.organizationId,
      checkInAt: { gte: from, lt: to },
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
    },
    include: { barber: { select: { id: true, name: true } }, salon: { select: { name: true } } },
    orderBy: { checkInAt: "desc" },
    take: 500,
  });

  const byBarber = new Map<string, { barberId: string; barberName: string; days: number; minutes: number; openShifts: number }>();
  for (const record of records) {
    const row = byBarber.get(record.barberId) ?? {
      barberId: record.barberId,
      barberName: record.barber.name,
      days: 0,
      minutes: 0,
      openShifts: 0,
    };
    row.days += 1;
    row.minutes += minutesWorked(record);
    if (!record.checkOutAt) row.openShifts += 1;
    byBarber.set(record.barberId, row);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    rows: records.map((record) => ({
      ...toAttendanceRow(record),
      barberName: record.barber.name,
      salonName: record.salon.name,
    })),
    summary: [...byBarber.values()]
      .map((row) => ({
        ...row,
        hours: Math.round((row.minutes / 60) * 10) / 10,
        averageHoursPerDay: row.days > 0 ? Math.round((row.minutes / row.days / 60) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

function minutesWorked(record: { checkInAt: Date; checkOutAt: Date | null }) {
  if (!record.checkOutAt) return 0;
  return Math.max(0, Math.round((record.checkOutAt.getTime() - record.checkInAt.getTime()) / 60000));
}

function toAttendanceRow(record: {
  id: string;
  barberId: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  source: string;
  notes: string | null;
}) {
  return {
    id: record.id,
    barberId: record.barberId,
    checkInAt: record.checkInAt.toISOString(),
    checkOutAt: record.checkOutAt?.toISOString() ?? null,
    minutes: minutesWorked(record as { checkInAt: Date; checkOutAt: Date | null }),
    isOpen: !record.checkOutAt,
    source: record.source,
    notes: record.notes,
  };
}

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfDay(date: Date | string) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endExclusive(date: Date | string) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}
