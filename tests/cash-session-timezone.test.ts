import { describe, expect, it, vi } from "vitest";
import { getCashSessionHistory } from "../lib/cash-sessions/cash-session-service";

describe("cash session Riyadh date filters", () => {
  it("queries the complete civil day even when the server timezone differs", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { cashSession: { findMany } };

    await getCashSessionHistory(prisma as never, {
      organizationId: "org-1",
      from: "2026-08-11",
      to: "2026-08-11",
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        closedAt: {
          gte: new Date("2026-08-10T21:00:00.000Z"),
          lt: new Date("2026-08-11T21:00:00.000Z"),
        },
      }),
    }));
  });
});
