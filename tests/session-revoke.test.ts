import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { hashSessionToken, revokeSession } from "../lib/auth/session";

describe("session revocation", () => {
  it("deletes the push subscription in the same transaction before revoking the session", async () => {
    const token = "test-session-token";
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({ id: "session-a", revokedAt: new Date() });
    const tx = {
      barberPushSubscription: { deleteMany },
      session: { update },
    };
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue({ id: "session-a", revokedAt: null }),
      },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;

    await revokeSession(prisma, token);

    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashSessionToken(token) },
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { sessionId: "session-a" } });
    expect(update).toHaveBeenCalledWith({
      where: { id: "session-a" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(deleteMany.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
  });
});
