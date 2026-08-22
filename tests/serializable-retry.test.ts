import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { closeCashSession, openCashSession } from "../lib/cash-sessions/cash-session-service";
import { BusinessError } from "../lib/errors";
import { SERIALIZABLE_MAX_ATTEMPTS, isSerializationConflict, runSerializable } from "../lib/db/serializable-retry";

/**
 * إعادة تنفيذ المعاملات التسلسلية.
 *
 * القسم الأول يقود الفشل بدقة عبر عميل مزيّف (لا يمكن إنتاج ثمانية تعارضات
 * متتالية على قاعدة حقيقية بشكل حتمي)، والقسم الثاني يثبت على PostgreSQL الفعلي
 * أن التزامن لا ينتج إغلاقًا مزدوجًا ولا حركة مالية مكرّرة.
 */

const prisma = new PrismaClient();
const ORG = "org_default";
const createdBarberIds: string[] = [];
const createdSessionIds: string[] = [];

/** عميل مزيّف يرمي `P2034` عددًا محددًا من المرات ثم ينجح. */
function conflictingPrisma(failures: number) {
  let attempts = 0;
  let bodyRuns = 0;
  return {
    get attempts() {
      return attempts;
    },
    get bodyRuns() {
      return bodyRuns;
    },
    async $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      attempts += 1;
      if (attempts <= failures) {
        throw new Prisma.PrismaClientKnownRequestError("write conflict", {
          code: "P2034",
          clientVersion: "test",
        });
      }
      bodyRuns += 1;
      return fn({} as Prisma.TransactionClient);
    },
  };
}

describe("serializable retry policy", () => {
  it("succeeds on the second attempt after one conflict", async () => {
    const client = conflictingPrisma(1);

    const result = await runSerializable(client, "test.one_conflict", async () => "done");

    expect(result).toBe("done");
    expect(client.attempts).toBe(2);
  });

  it("runs the body exactly once even after several conflicts", async () => {
    const client = conflictingPrisma(4);
    let sideEffects = 0;

    const result = await runSerializable(client, "test.many_conflicts", async () => {
      sideEffects += 1;
      return sideEffects;
    });

    // الجسم لا يُنفَّذ إلا في المحاولة الناجحة — لا تكرار بعد النجاح.
    expect(result).toBe(1);
    expect(sideEffects).toBe(1);
    expect(client.bodyRuns).toBe(1);
    expect(client.attempts).toBe(5);
  });

  it("gives up after the maximum attempts instead of looping forever", async () => {
    const client = conflictingPrisma(Number.MAX_SAFE_INTEGER);

    await expect(runSerializable(client, "test.exhausted", async () => "never")).rejects.toSatisfy(isSerializationConflict);
    expect(client.attempts).toBe(SERIALIZABLE_MAX_ATTEMPTS);
    expect(SERIALIZABLE_MAX_ATTEMPTS).toBe(8);
  });

  it("never retries a business rule or a validation failure", async () => {
    const business = conflictingPrisma(0);
    const validation = conflictingPrisma(0);

    await expect(
      runSerializable(business, "test.business", async () => {
        throw new BusinessError("قاعدة أعمال");
      }),
    ).rejects.toThrow("قاعدة أعمال");
    await expect(
      runSerializable(validation, "test.validation", async () => {
        throw new TypeError("bad input");
      }),
    ).rejects.toThrow("bad input");

    // محاولة واحدة لكل منهما: الرفض الفوري لا يتحول إلى انتظار بلا فائدة.
    expect(business.attempts).toBe(1);
    expect(validation.attempts).toBe(1);
  });

  it("logs each retry with counters only, never a payload", async () => {
    const client = conflictingPrisma(2);
    const lines: string[] = [];
    const original = console.warn;
    console.warn = (line: unknown) => void lines.push(String(line));

    try {
      await runSerializable(client, "cash_session.close", async () => "done");
    } finally {
      console.warn = original;
    }

    const retries = lines.filter((line) => line.includes("serializable_transaction_retry")).map((line) => JSON.parse(line));
    expect(retries).toHaveLength(2);
    expect(retries[0].context).toMatchObject({ operation: "cash_session.close", attempt: 1, maxAttempts: SERIALIZABLE_MAX_ATTEMPTS });
    // وسم وعدّادات فقط: لا مبالغ ولا معرّفات ولا هواتف ولا رموز.
    expect(Object.keys(retries[0].context).sort()).toEqual(["attempt", "maxAttempts", "operation"]);
  });

  it("only classifies P2034 as retryable", () => {
    expect(isSerializationConflict(new Prisma.PrismaClientKnownRequestError("x", { code: "P2034", clientVersion: "t" }))).toBe(true);
    expect(isSerializationConflict(new Prisma.PrismaClientKnownRequestError("x", { code: "P2002", clientVersion: "t" }))).toBe(false);
    expect(isSerializationConflict(new BusinessError("x"))).toBe(false);
    expect(isSerializationConflict(new Error("x"))).toBe(false);
  });

  it("gives queued transactions enough time to start without retrying P2028", async () => {
    let receivedOptions: { maxWait?: number; timeout?: number } | undefined;
    const client = {
      async $transaction<T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        options: { maxWait?: number; timeout?: number },
      ) {
        receivedOptions = options;
        return fn({} as Prisma.TransactionClient);
      },
    };

    await runSerializable(client, "test.wait_budget", async () => "done");

    expect(receivedOptions?.maxWait).toBeGreaterThan(2_000);
    expect(receivedOptions?.timeout).toBeGreaterThan(receivedOptions?.maxWait ?? 0);
  });
});

describe("cash session concurrency on the real database", () => {
  let barberId = "";

  beforeAll(async () => {
    const barber = await prisma.barber.create({
      data: {
        organizationId: ORG,
        salonId: "salon_default",
        name: `حلاق تزامن ${Date.now()}`,
        phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
        accessPinHash: await hashBarberPin("Tanal@123"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barber.id);
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: createdSessionIds } }, { actorBarberId: { in: createdBarberIds } }] } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  }, 30000);

  it("opens exactly one session when two requests race", async () => {
    const results = await Promise.allSettled([
      openCashSession(prisma, { barberId }),
      openCashSession(prisma, { barberId }),
    ]);
    const opened = await prisma.cashSession.findMany({ where: { barberId } });
    createdSessionIds.push(...opened.map((session) => session.id));

    // لا فقد تحديث ولا جلستان: إحدى المحاولتين تعيد الجلسة القائمة.
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(opened).toHaveLength(1);
  }, 30000);

  it("closes once and writes one audit entry when two closes race", async () => {
    const sessionId = (await prisma.cashSession.findFirstOrThrow({ where: { barberId, status: "OPEN" } })).id;

    const results = await Promise.allSettled([
      closeCashSession(prisma, { barberId, organizationId: ORG }),
      closeCashSession(prisma, { barberId, organizationId: ORG }),
    ]);
    const closed = await prisma.cashSession.findUniqueOrThrow({ where: { id: sessionId } });
    const auditEntries = await prisma.auditLog.count({ where: { entityId: sessionId, action: "cash_session.closed" } });

    // إغلاق واحد ينجح، والآخر يجد الجلسة مغلقة فيُردّ بخطأ أعمال واضح.
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(closed.status).toBe("CLOSED");
    // ولا حركة مالية مكرّرة: قيد تدقيق واحد لإغلاق واحد.
    expect(auditEntries).toBe(1);
  }, 30000);
});
