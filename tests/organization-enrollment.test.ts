import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { decodeJoinContext, encodeJoinContext, joinReturnPath, safeInternalPath } from "../lib/customers/join-context";
import { enrollAccountInOrganization, resolveEnrollableOrganization } from "../lib/customers/organization-enrollment";
import { issueCustomerPortalToken } from "../lib/customers/customer-portal";
import { getPortalIdentity, getPortalVisits } from "../lib/customers/portal-view";
import { recordLoyaltyMovement } from "../lib/loyalty/ledger";
import { toSaudiE164, toSaudiLocalPhone } from "../lib/phone/saudi-phone";
import { normalizeEmail } from "../lib/email/normalize-email";

/**
 * الانضمام الموحّد لمؤسسة.
 *
 * ```
 * CustomerAccount ──┬── Customer @ Org A ── LoyaltyAccount A
 *                   └── Customer @ Org B ── LoyaltyAccount B
 * ```
 * حساب واحد، عضويات متعددة، أرصدة منفصلة — وبلا أي مطالبة بسجل قديم.
 */

const prisma = new PrismaClient();
process.env.CUSTOMER_OTP_PEPPER = process.env.CUSTOMER_OTP_PEPPER ?? "test-pepper-not-for-production";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-not-for-production";

const createdAccountIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdOrganizationIds: string[] = [];
let orgA = { id: "", slug: "" };
let orgB = { id: "", slug: "" };
let suspended = { id: "", slug: "" };

beforeAll(async () => {
  orgA = await createOrganization("ACTIVE");
  orgB = await createOrganization("ACTIVE");
  suspended = await createOrganization("SUSPENDED");
}, 60000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: createdOrganizationIds } }, { entityId: { in: createdCustomerIds } }] } });
  await prisma.loyaltyTransaction.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
  await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  await prisma.customerAccount.deleteMany({ where: { id: { in: createdAccountIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  await prisma.$disconnect();
}, 60000);

describe("unified organization enrollment", () => {
  it("creates the organization customer and its loyalty account for a new member", async () => {
    const account = await createVerifiedAccount();

    const result = await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    const customer = await track(await prisma.customer.findFirstOrThrow({
      where: { accountId: account.id, organizationId: orgA.id },
      include: { loyaltyAccount: true },
    }));

    expect(result.outcome).toBe("ENROLLED");
    expect(customer.accountId).toBe(account.id);
    expect(customer.organizationId).toBe(orgA.id);
    // العميل وحساب ولائه يولدان معًا — لا عميل بلا رصيد بسبب فشل في المنتصف.
    expect(customer.loyaltyAccount).not.toBeNull();
    expect(customer.loyaltyAccount?.organizationId).toBe(orgA.id);
    expect(customer.loyaltyAccount?.points).toBe(0);
  });

  /**
   * الجسر من الانضمام إلى بوابة العميل.
   *
   * هذه التغطية كانت تعيش في `tests/loyalty-signup.test.ts` فوق
   * `selfRegisterForLoyalty` — دالةٌ بلا مستدعٍ إنتاجي واحد، استُبدلت بـ
   * `enrollAccountInOrganization`. فكان المسار الأمني الحسّاس (الانضمام ثم فتح
   * البوابة) يحمل اختبارًا أخضر يغطّي **الدالة الخاطئة**: أي تراجع في المسار
   * الحيّ يمرّ بلا أن يكشفه أحد. نُقلت هنا فوق ما يُستدعى فعلًا من
   * `/api/account/enroll`.
   */
  it("يفتح رابط البوابة الصادر بعد الانضمام صفحةَ صاحبه وحده", async () => {
    const account = await createVerifiedAccount();
    const result = await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    if (result.outcome === "PHONE_CONFLICT") throw new Error("expected enrollment");
    await track(await prisma.customer.findFirstOrThrow({ where: { id: result.customerId } }));

    // نفس النداء الذي يجريه `/api/account/enroll` بعد نجاح الانضمام.
    const token = await issueCustomerPortalToken(prisma, result.customerId, result.organizationId);
    const identity = await getPortalIdentity(token);

    expect(identity).not.toBeNull();
    expect(identity?.customer.name).toBe(account.name);
    expect(identity?.points).toBe(0);
    expect((await getPortalVisits(identity!)).recentVisits).toHaveLength(0);
  });

  it("يرفض رمز بوابة غير صحيح أو قصير أو فارغ", async () => {
    expect(await getPortalIdentity("invalid-token-value-123")).toBeNull();
    expect(await getPortalIdentity("")).toBeNull();
    // الرمز القصير يُرفض قبل الوصول لقاعدة البيانات أصلًا.
    expect(await getPortalIdentity("short")).toBeNull();
  });

  it("copies the phone into the legacy local shape without claiming ownership", async () => {
    const account = await createVerifiedAccount();
    await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    const customer = await track(await prisma.customer.findFirstOrThrow({ where: { accountId: account.id, organizationId: orgA.id } }));
    const stored = await prisma.customerAccount.findUniqueOrThrow({ where: { id: account.id } });

    // `+9665XXXXXXXX` على الهوية، `05XXXXXXXX` في سجل المؤسسة.
    expect(stored.phone).toMatch(/^\+9665\d{8}$/);
    expect(customer.phone).toBe(toSaudiLocalPhone(stored.phone));
    expect(customer.phone).toMatch(/^05\d{8}$/);
    // والنسخ ليس توثيقًا ولا ملكية عالمية.
    expect(stored.phoneVerifiedAt).toBeNull();
    expect(stored.phoneNormalized).toBeNull();
  });

  it("is idempotent when the same account joins the same organization twice", async () => {
    const account = await createVerifiedAccount();

    const first = await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    const second = await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    await track(await prisma.customer.findFirstOrThrow({ where: { accountId: account.id, organizationId: orgA.id } }));

    expect(first.outcome).toBe("ENROLLED");
    expect(second.outcome).toBe("ALREADY_ENROLLED");
    if (first.outcome === "PHONE_CONFLICT" || second.outcome === "PHONE_CONFLICT") throw new Error("unexpected conflict");
    expect(second.customerId).toBe(first.customerId);
    expect(await prisma.customer.count({ where: { accountId: account.id, organizationId: orgA.id } })).toBe(1);
    expect(await prisma.loyaltyAccount.count({ where: { customerId: first.customerId } })).toBe(1);
  });

  it("creates one customer and one loyalty account under concurrent joins", async () => {
    const account = await createVerifiedAccount();

    const results = await Promise.allSettled([
      enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug }),
      enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug }),
    ]);
    const customers = await prisma.customer.findMany({ where: { accountId: account.id, organizationId: orgA.id } });
    createdCustomerIds.push(...customers.map((customer) => customer.id));

    // `UNIQUE(accountId, organizationId)` يحسم السباق، والخاسر يقرأ الفائز.
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(customers).toHaveLength(1);
    expect(await prisma.loyaltyAccount.count({ where: { customerId: customers[0].id } })).toBe(1);
  }, 30000);

  it("adds a second organization to the same account with an independent balance", async () => {
    const account = await createVerifiedAccount();

    await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgB.slug });
    const memberships = await prisma.customer.findMany({ where: { accountId: account.id }, include: { loyaltyAccount: true } });
    createdCustomerIds.push(...memberships.map((customer) => customer.id));

    const inA = memberships.find((customer) => customer.organizationId === orgA.id)!;
    const inB = memberships.find((customer) => customer.organizationId === orgB.id)!;
    await recordLoyaltyMovement(prisma, { organizationId: orgA.id, customerId: inA.id, type: "ADJUST", points: 850, description: "رصيد أ" });
    await recordLoyaltyMovement(prisma, { organizationId: orgB.id, customerId: inB.id, type: "ADJUST", points: 300, description: "رصيد ب" });

    // حساب واحد، سجلّان، رصيدان لا يتقاطعان.
    expect(memberships).toHaveLength(2);
    expect(await prisma.customerAccount.count({ where: { id: account.id } })).toBe(1);
    expect((await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId: inA.id } })).points).toBe(850);
    expect((await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId: inB.id } })).points).toBe(300);
  }, 30000);

  it("refuses a second customer for the same account in one organization at the database level", async () => {
    const account = await createVerifiedAccount();
    await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    await track(await prisma.customer.findFirstOrThrow({ where: { accountId: account.id, organizationId: orgA.id } }));

    await expect(
      prisma.customer.create({
        data: { organizationId: orgA.id, accountId: account.id, name: "تكرار", phone: uniqueLocalPhone() },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("reports a conflict instead of merging an unlinked customer with the same phone", async () => {
    const account = await createVerifiedAccount();
    const localPhone = toSaudiLocalPhone((await prisma.customerAccount.findUniqueOrThrow({ where: { id: account.id } })).phone);
    const stranger = await prisma.customer.create({
      data: { organizationId: orgA.id, name: "سجل غير مرتبط", phone: localPhone },
    });
    createdCustomerIds.push(stranger.id);

    const result = await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });

    // تطابق الرقم ليس إثبات هوية: لا ضمّ ولا تعديل على السجل القائم.
    expect(result.outcome).toBe("PHONE_CONFLICT");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: stranger.id } })).accountId).toBeNull();
    expect(await prisma.customer.count({ where: { accountId: account.id, organizationId: orgA.id } })).toBe(0);
  });

  it("refuses a suspended organization and an unknown reference with one message", async () => {
    const account = await createVerifiedAccount();

    await expect(enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: suspended.slug })).rejects.toThrow("غير متاح");
    await expect(enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: "no-such-salon" })).rejects.toThrow("غير متاح");
    await expect(resolveEnrollableOrganization(prisma, "   ")).rejects.toThrow("غير متاح");
  });

  it("refuses an unverified account", async () => {
    const account = await createAccount({ verified: false });

    await expect(enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug })).rejects.toThrow("فعّل بريدك");
    expect(await prisma.customer.count({ where: { accountId: account.id } })).toBe(0);
  });
});

describe("join context integrity", () => {
  it("round-trips a signed context", () => {
    const state = encodeJoinContext("my-salon");

    expect(decodeJoinContext(state)?.organizationSlug).toBe("my-salon");
  });

  it("rejects a tampered organization, a forged signature and an expired context", () => {
    const state = encodeJoinContext("salon-a");
    const [payload, signature] = state.split(".");
    const otherPayload = encodeJoinContext("salon-b").split(".")[0];

    // تبديل الحمولة مع الإبقاء على التوقيع: لا يُقبل.
    expect(decodeJoinContext(`${otherPayload}.${signature}`)).toBeNull();
    expect(decodeJoinContext(`${payload}.${"x".repeat(signature.length)}`)).toBeNull();
    expect(decodeJoinContext(`${payload}.short`)).toBeNull();
    expect(decodeJoinContext("not-a-state")).toBeNull();
    expect(decodeJoinContext(null)).toBeNull();
    // منتهٍ: أُصدر قبل أكثر من ساعة.
    expect(decodeJoinContext(encodeJoinContext("salon-a", Date.now() - 2 * 60 * 60 * 1000))).toBeNull();
  });

  it("never turns the return path into an open redirect", () => {
    const state = encodeJoinContext("salon-a");
    expect(joinReturnPath(state)).toBe(`/join?state=${encodeURIComponent(state)}`);
    expect(joinReturnPath("tampered")).toBe("/account");
    expect(joinReturnPath(null)).toBe("/account");
    expect(safeInternalPath("https://evil.example.com")).toBe("/account");
    expect(safeInternalPath("//evil.example.com")).toBe("/account");
    expect(safeInternalPath("/account/loyalty")).toBe("/account/loyalty");
  });
});

describe("tenant isolation stays intact", () => {
  it("keeps each organization blind to the other memberships of a shared account", async () => {
    const account = await createVerifiedAccount();
    await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
    await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgB.slug });
    const all = await prisma.customer.findMany({ where: { accountId: account.id } });
    createdCustomerIds.push(...all.map((customer) => customer.id));

    // استعلام المؤسسة مقيّد بمؤسستها: لا يرى عضوية الحساب في غيرها.
    const seenByA = await prisma.customer.findMany({ where: { organizationId: orgA.id, accountId: account.id } });
    const seenByB = await prisma.customer.findMany({ where: { organizationId: orgB.id, accountId: account.id } });

    expect(seenByA).toHaveLength(1);
    expect(seenByB).toHaveLength(1);
    expect(seenByA[0].id).not.toBe(seenByB[0].id);
    // والحساب نفسه يرى الاثنتين.
    expect(all).toHaveLength(2);
  }, 30000);
});

async function createOrganization(status: "ACTIVE" | "SUSPENDED") {
  const plan = (await prisma.organization.findUniqueOrThrow({ where: { id: "org_default" }, select: { planId: true } })).planId;
  const organization = await prisma.organization.create({
    data: {
      name: `مؤسسة انضمام ${status}`,
      slug: `enroll-${status.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      planId: plan,
      status,
      subscriptionStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  createdOrganizationIds.push(organization.id);
  return { id: organization.id, slug: organization.slug };
}

async function createAccount({ verified }: { verified: boolean }) {
  const national = `5${Math.floor(10000000 + Math.random() * 89999999)}`;
  const email = `enroll.${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  const account = await prisma.customerAccount.create({
    data: {
      name: "منصور الانضمام",
      phone: toSaudiE164(`0${national}`),
      email,
      emailNormalized: normalizeEmail(email),
      emailVerifiedAt: verified ? new Date() : null,
    },
  });
  createdAccountIds.push(account.id);
  return account;
}

function createVerifiedAccount() {
  return createAccount({ verified: true });
}

async function track<T extends { id: string }>(record: T) {
  createdCustomerIds.push(record.id);
  return record;
}

function uniqueLocalPhone() {
  return `05${Math.floor(10000000 + Math.random() * 89999999)}`;
}
