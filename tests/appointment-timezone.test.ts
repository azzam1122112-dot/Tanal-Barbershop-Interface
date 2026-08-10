import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { listAppointments } from "../lib/appointments/appointment-service";

describe("appointment Riyadh day scope", () => {
  it("queries the complete Riyadh day even when the server runs in UTC", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { appointment: { findMany } } as unknown as PrismaClient;

    await listAppointments(prisma, {
      organizationId: "org-a",
      barberId: "barber-a",
      date: new Date("2026-08-11T00:30:00.000+03:00"),
    });

    const call = findMany.mock.calls[0]?.[0];
    expect(call.where.startAt.gte.toISOString()).toBe("2026-08-10T21:00:00.000Z");
    expect(call.where.startAt.lt.toISOString()).toBe("2026-08-11T21:00:00.000Z");
  });
});
