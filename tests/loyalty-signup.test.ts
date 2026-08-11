import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { selfRegisterForLoyalty } from "../lib/customers/loyalty-signup";
import { getPortalIdentity, getPortalVisits } from "../lib/customers/portal-view";

const prisma = new PrismaClient();
const ORG = "org_default";
const createdCustomerIds: string[] = [];
const rateKeys: string[] = [];
const privacyNotice = { privacyNoticeAcknowledged: true as const, privacyNoticeControllerName: "صالون الاختبار" };

function randomLocalPhone() {
  return `05${Math.floor(10000000 + Math.random() * 89999999)}`;
}

describe("التسجيل الذاتي في برنامج الولاء", () => {
  beforeAll(async () => {
    // نضمن أن المؤسسة الافتراضية اشتراكها فعّال وإلا رفض الحارس التسجيل.
    await prisma.organization.update({
      where: { id: ORG },
      data: { status: "ACTIVE", subscriptionStatus: "ACTIVE", trialEndsAt: null },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdCustomerIds } } });
    await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.loginAttempt.deleteMany({ where: { key: { in: rateKeys } } });
    await prisma.$disconnect();
  });

  it("ينشئ عميلًا برصيد ولاء ويعيد رابط صفحته", async () => {
    const rateLimitKey = `test-${Date.now()}-a`;
    rateKeys.push(`loyalty-signup:${rateLimitKey}`);

    const result = await selfRegisterForLoyalty(prisma, {
      organizationId: ORG,
      name: "عميل تسجيل ذاتي",
      phone: randomLocalPhone(),
      rateLimitKey,
      ...privacyNotice,
    });

    expect(result.outcome).toBe("CREATED");
    if (result.outcome !== "CREATED") return;
    createdCustomerIds.push(result.customerId);

    expect(result.portalPath).toMatch(/^\/my\/.+/);

    const account = await prisma.loyaltyAccount.findUnique({ where: { customerId: result.customerId } });
    expect(account).not.toBeNull();
    expect(account?.points).toBe(0);
  });

  it("لا يكشف رابط عميل مسجّل مسبقًا", async () => {
    const phone = randomLocalPhone();
    const firstKey = `test-${Date.now()}-b1`;
    const secondKey = `test-${Date.now()}-b2`;
    rateKeys.push(`loyalty-signup:${firstKey}`, `loyalty-signup:${secondKey}`);

    const first = await selfRegisterForLoyalty(prisma, {
      organizationId: ORG,
      name: "عميل أول",
      phone,
      rateLimitKey: firstKey,
      ...privacyNotice,
    });
    expect(first.outcome).toBe("CREATED");
    if (first.outcome === "CREATED") createdCustomerIds.push(first.customerId);

    // محاولة ثانية بنفس الرقم من جهاز آخر: لا رابط ولا رصيد — منعًا لتعداد العملاء.
    const second = await selfRegisterForLoyalty(prisma, {
      organizationId: ORG,
      name: "متطفّل",
      phone,
      rateLimitKey: secondKey,
      ...privacyNotice,
    });
    expect(second.outcome).toBe("ALREADY_REGISTERED");
    expect(second).not.toHaveProperty("portalPath");
  });

  it("يبني رابطًا صالحًا يفتح صفحة العميل ببياناته وحده", async () => {
    const rateLimitKey = `test-${Date.now()}-c`;
    rateKeys.push(`loyalty-signup:${rateLimitKey}`);

    const result = await selfRegisterForLoyalty(prisma, {
      organizationId: ORG,
      name: "عميل البوابة",
      phone: randomLocalPhone(),
      rateLimitKey,
      ...privacyNotice,
    });
    if (result.outcome !== "CREATED") throw new Error("expected CREATED");
    createdCustomerIds.push(result.customerId);

    const token = result.portalPath.replace("/my/", "");
    const identity = await getPortalIdentity(token);

    expect(identity).not.toBeNull();
    expect(identity?.customer.name).toBe("عميل البوابة");
    expect(identity?.points).toBe(0);
    expect((await getPortalVisits(identity!)).recentVisits).toHaveLength(0);
  });

  it("يرفض رمزًا غير صحيح", async () => {
    expect(await getPortalIdentity("invalid-token-value-123")).toBeNull();
    expect(await getPortalIdentity("")).toBeNull();
    // رمز قصير يُرفض قبل الوصول لقاعدة البيانات.
    expect(await getPortalIdentity("short")).toBeNull();
  });

  it("يرفض اسمًا فارغًا", async () => {
    const rateLimitKey = `test-${Date.now()}-d`;
    rateKeys.push(`loyalty-signup:${rateLimitKey}`);

    await expect(
      selfRegisterForLoyalty(prisma, {
        organizationId: ORG,
        name: "  ",
        phone: randomLocalPhone(),
        rateLimitKey,
        ...privacyNotice,
      }),
    ).rejects.toThrow("الاسم مطلوب");
  });
});
