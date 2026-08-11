import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { listAppointments } from "../lib/appointments/appointment-service";
import { overlapWindowStart } from "../lib/appointments/overlap-window";

const DAY_START = new Date("2026-08-10T21:00:00.000Z"); // 11 أغسطس 00:00 بتوقيت الرياض
const DAY_END = new Date("2026-08-11T21:00:00.000Z");

function prismaWith(rows: { startAt: Date; durationMinutes: number }[]) {
  const findMany = vi.fn().mockResolvedValue(
    rows.map((row, index) => ({
      id: `appointment-${index}`,
      startAt: row.startAt,
      durationMinutes: row.durationMinutes,
      status: "BOOKED",
      customerName: "عميل",
      customerPhone: "0500000000",
      notes: null,
      barber: null,
      customer: null,
      salon: null,
      services: [],
    })),
  );
  return { prisma: { appointment: { findMany } } as unknown as PrismaClient, findMany };
}

describe("appointment Riyadh day scope", () => {
  it("queries the complete Riyadh day even when the server runs in UTC", async () => {
    const { prisma, findMany } = prismaWith([]);

    await listAppointments(prisma, {
      organizationId: "org-a",
      barberId: "barber-a",
      date: new Date("2026-08-11T00:30:00.000+03:00"),
    });

    const call = findMany.mock.calls[0]?.[0];
    // الحدّ الأعلى دقيق: موعد يبدأ بعد نهاية اليوم لا يخصّه.
    expect(call.where.startAt.lt.toISOString()).toBe(DAY_END.toISOString());
    // والحدّ الأدنى موسّع للخلف بأقصى مدة، ليدخل ما بدأ أمس وما زال جاريًا.
    expect(call.where.startAt.gte.toISOString()).toBe(overlapWindowStart(DAY_START).toISOString());
  });

  it("keeps an appointment that started yesterday and is still running", async () => {
    // 23:30 أمس + 90 دقيقة = ينتهي 01:00 من اليوم المطلوب.
    const { prisma } = prismaWith([
      { startAt: new Date("2026-08-10T20:30:00.000Z"), durationMinutes: 90 },
    ]);

    const rows = await listAppointments(prisma, {
      organizationId: "org-a",
      date: new Date("2026-08-11T00:30:00.000+03:00"),
    });

    expect(rows).toHaveLength(1);
  });

  it("drops an appointment that ended before the day started", async () => {
    const { prisma } = prismaWith([
      { startAt: new Date("2026-08-10T15:00:00.000Z"), durationMinutes: 30 },
    ]);

    const rows = await listAppointments(prisma, {
      organizationId: "org-a",
      date: new Date("2026-08-11T00:30:00.000+03:00"),
    });

    expect(rows).toHaveLength(0);
  });
});
