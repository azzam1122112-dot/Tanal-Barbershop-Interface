import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { middleware } from "../middleware";
import { CUSTOMER_SESSION_COOKIE_NAME } from "../lib/customers/account-config";
import { enrollAccountInOrganization } from "../lib/customers/organization-enrollment";
import { getCustomerLoyaltyWallet, getCustomerOrganizationLoyalty, LOYALTY_MOVEMENT_LABEL } from "../lib/customers/loyalty-wallet";
import { recordLoyaltyMovement } from "../lib/loyalty/ledger";
import { normalizeEmail } from "../lib/email/normalize-email";
import { toSaudiE164 } from "../lib/phone/saudi-phone";

/**
 * محفظة الولاء الموحّدة.
 *
 * المؤسسة بطاقة، والفرع موقع حركة داخلها. الأرصدة لا تُجمع، والملكية مفروضة في
 * الاستعلام لا بعده.
 */

const prisma = new PrismaClient();
process.env.CUSTOMER_OTP_PEPPER = process.env.CUSTOMER_OTP_PEPPER ?? "test-pepper-not-for-production";
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-not-for-production";

const createdAccountIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdOrganizationIds: string[] = [];
const createdSalonIds: string[] = [];
const createdBarberIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];

let orgA = { id: "", slug: "", name: "" };
let orgB = { id: "", slug: "", name: "" };
let branches: string[] = [];
let account = { id: "" };
let customerA = "";
let customerB = "";

beforeAll(async () => {
  orgA = await createOrganization("مؤسسة أناقة الرجل");
  orgB = await createOrganization("Royal Barber");
  branches = [
    (await createSalon(orgA.id, "الرياض")).id,
    (await createSalon(orgA.id, "جدة")).id,
    (await createSalon(orgA.id, "الدمام")).id,
  ];

  account = await createVerifiedAccount();
  const enrolledA = await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgA.slug });
  const enrolledB = await enrollAccountInOrganization(prisma, { accountId: account.id, organizationSlug: orgB.slug });
  customerA = (enrolledA as { customerId: string }).customerId;
  customerB = (enrolledB as { customerId: string }).customerId;
  createdCustomerIds.push(customerA, customerB);

  // نشاط حقيقي: زيارة مؤكَّدة في كل فرع من فروع «أ»، وحركات نقاط منسوبة إليها.
  for (const [index, salonId] of branches.entries()) {
    await createVisit(orgA.id, salonId, customerA, 100 + index * 10);
    await recordLoyaltyMovement(prisma, {
      organizationId: orgA.id,
      customerId: customerA,
      salonId,
      type: "EARN",
      points: 100 + index * 10,
      description: `نقاط زيارة ${index}`,
    });
  }
  await recordLoyaltyMovement(prisma, {
    organizationId: orgA.id, customerId: customerA, salonId: branches[1], type: "REDEEM", points: -150, description: "استبدال",
  });
  await recordLoyaltyMovement(prisma, {
    organizationId: orgB.id, customerId: customerB, salonId: null, type: "ADJUST", points: 320, description: "رصيد ب",
  });
}, 120000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: createdOrganizationIds } }, { entityId: { in: [...createdCustomerIds, ...createdVisitIds] } }] } });
  await prisma.loyaltyTransaction.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
  await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
  await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  await prisma.customerAccount.deleteMany({ where: { id: { in: createdAccountIds } } });
  await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
  await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
  await prisma.salon.deleteMany({ where: { id: { in: createdSalonIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  await prisma.$disconnect();
}, 120000);

describe("wallet summary", () => {
  it("shows one card per organization, never one per branch", async () => {
    const wallet = await getCustomerLoyaltyWallet(prisma, account.id);
    const cardA = wallet.find((card) => card.reference === orgA.slug)!;

    expect(wallet).toHaveLength(2);
    // ثلاثة فروع في «أ» تنتج بطاقة واحدة تذكر عددها.
    expect(cardA.branchCount).toBe(3);
    expect(cardA.visitCount).toBe(3);
    expect(wallet.filter((card) => card.reference === orgA.slug)).toHaveLength(1);
  });

  it("keeps balances independent and never aggregates them", async () => {
    const wallet = await getCustomerLoyaltyWallet(prisma, account.id);
    const cardA = wallet.find((card) => card.reference === orgA.slug)!;
    const cardB = wallet.find((card) => card.reference === orgB.slug)!;

    // 100 + 110 + 120 − 150 = 180، و«ب» مستقلة تمامًا.
    expect(cardA.points).toBe(180);
    expect(cardB.points).toBe(320);
    expect(wallet.some((card) => card.points === 500)).toBe(false);
  });

  it("returns an empty wallet for an account with no memberships", async () => {
    const lonely = await createVerifiedAccount();

    expect(await getCustomerLoyaltyWallet(prisma, lonely.id)).toEqual([]);
  });

  it("sorts by most recent activity", async () => {
    const wallet = await getCustomerLoyaltyWallet(prisma, account.id);
    const timestamps = wallet.map((card) => new Date(card.lastActivityAt ?? card.joinedAt).getTime());

    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    expect(wallet[0].lastActivityAt).not.toBeNull();
  });
});

describe("organization card", () => {
  it("lists only the branches the customer actually dealt with, without duplicates", async () => {
    const card = (await getCustomerOrganizationLoyalty(prisma, account.id, orgA.slug))!;
    const extra = await createSalon(orgA.id, "فرع لم يُزَر");

    const refreshed = (await getCustomerOrganizationLoyalty(prisma, account.id, orgA.slug))!;
    expect(card.branches).toHaveLength(3);
    expect(new Set(refreshed.branches.map((branch) => branch.salonId)).size).toBe(3);
    // فرع لم تقع فيه زيارة لا يظهر كأنه تعامل.
    expect(refreshed.branches.some((branch) => branch.salonId === extra.id)).toBe(false);
  });

  it("attributes each movement to its branch and labels the type in Arabic", async () => {
    const card = (await getCustomerOrganizationLoyalty(prisma, account.id, orgA.slug))!;
    const redeem = card.activity.entries.find((entry) => entry.type === "REDEEM")!;

    expect(redeem.branchName).toBe(await salonName(branches[1]));
    expect(redeem.points).toBe(-150);
    expect(LOYALTY_MOVEMENT_LABEL[redeem.type]).toBe("استبدال");
    expect(LOYALTY_MOVEMENT_LABEL.EARN).toBe("اكتساب نقاط");
  });

  it("paginates the activity log instead of loading it whole", async () => {
    for (let index = 0; index < 22; index += 1) {
      await recordLoyaltyMovement(prisma, {
        organizationId: orgB.id, customerId: customerB, type: "EARN", points: 1, description: `حركة ${index}`,
      });
    }

    const first = (await getCustomerOrganizationLoyalty(prisma, account.id, orgB.slug, { page: 1 }))!;
    const second = (await getCustomerOrganizationLoyalty(prisma, account.id, orgB.slug, { page: 2 }))!;

    expect(first.activity.entries).toHaveLength(20);
    expect(first.activity.total).toBe(23);
    expect(second.activity.entries.length).toBeGreaterThan(0);
    expect(second.activity.entries.map((entry) => entry.id)).not.toEqual(first.activity.entries.map((entry) => entry.id));
  }, 60000);

  it("scopes rewards to the card's own organization", async () => {
    const reward = await prisma.rewardRule.create({
      data: { organizationId: orgA.id, name: "حلاقة مجانية", requiredPoints: 1000, discountAmount: 50, isActive: true },
    });

    const cardA = (await getCustomerOrganizationLoyalty(prisma, account.id, orgA.slug))!;
    const cardB = (await getCustomerOrganizationLoyalty(prisma, account.id, orgB.slug))!;

    expect(cardA.rewards.map((item) => item.id)).toContain(reward.id);
    expect(cardB.rewards.map((item) => item.id)).not.toContain(reward.id);
    expect(cardA.rewards.find((item) => item.id === reward.id)?.reachable).toBe(false);
  });

  it("keeps history when a branch closes and when the organization is suspended", async () => {
    await prisma.salon.update({ where: { id: branches[2] }, data: { isActive: false } });
    await prisma.organization.update({ where: { id: orgA.id }, data: { status: "SUSPENDED" } });

    const card = (await getCustomerOrganizationLoyalty(prisma, account.id, orgA.slug))!;
    const closed = card.branches.find((branch) => branch.salonId === branches[2])!;

    // لا حذف للبطاقة ولا للنسب التاريخي — فقط وسم الحالة.
    expect(card.organizationActive).toBe(false);
    expect(card.branches).toHaveLength(3);
    expect(closed.active).toBe(false);
    expect(closed.visits).toBe(1);
    expect(card.activity.entries.length).toBeGreaterThan(0);

    await prisma.organization.update({ where: { id: orgA.id }, data: { status: "ACTIVE" } });
  });
});

describe("wallet ownership", () => {
  it("returns nothing for a card the account does not own", async () => {
    const stranger = await createVerifiedAccount();

    // لا كشف للوجود: نتيجة فارغة تمامًا كبطاقة غير موجودة.
    expect(await getCustomerOrganizationLoyalty(prisma, stranger.id, orgA.slug)).toBeNull();
    expect(await getCustomerOrganizationLoyalty(prisma, account.id, "no-such-organization")).toBeNull();
    expect(await getCustomerLoyaltyWallet(prisma, stranger.id)).toEqual([]);
  });

  it("scopes every wallet query by accountId inside the where clause", () => {
    const source = readFileSync(join(process.cwd(), "lib/customers/loyalty-wallet.ts"), "utf8");

    // حارس مصدر: الملكية تُفرض في الاستعلام لا بفحص لاحق يُنسى مرة فيصير ثقبًا.
    expect(source).toMatch(/where:\s*\{\s*accountId\s*\}/);
    expect(source).toMatch(/where:\s*\{\s*accountId,\s*organization:/);
    expect(source).not.toMatch(/if\s*\(.*accountId\s*!==/);
  });

  it("is never reachable from organization-facing code", () => {
    const tenantFacing = sourceFiles(["app/api/dashboard", "app/api/barber", "app/dashboard", "app/barber", "lib/reports"]);
    const leaks = tenantFacing.filter((file) => /loyalty-wallet/.test(readFileSync(file, "utf8")));

    expect(leaks).toEqual([]);
  });

  it("keeps the wallet behind the customer cookie only", () => {
    const staff = new NextRequest("http://localhost:3000/account/loyalty", { headers: { host: "xmansx.com", "x-forwarded-proto": "https" } });
    staff.cookies.set("tanal_session", "a-staff-token");
    const customer = new NextRequest("http://localhost:3000/account/loyalty", { headers: { host: "xmansx.com", "x-forwarded-proto": "https" } });
    customer.cookies.set(CUSTOMER_SESSION_COOKIE_NAME, "a-customer-token");

    // كوكي الموظف لا يفتح المحفظة، وكوكي العميل يمر إلى الصفحة.
    expect(middleware(staff).headers.get("location")).toBe("https://xmansx.com/account/login");
    expect(middleware(customer).headers.get("location")).toBeNull();
  });
});

async function createOrganization(name: string) {
  const plan = (await prisma.organization.findUniqueOrThrow({ where: { id: "org_default" }, select: { planId: true } })).planId;
  const organization = await prisma.organization.create({
    data: {
      name,
      slug: `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      planId: plan,
      status: "ACTIVE",
      subscriptionStatus: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  createdOrganizationIds.push(organization.id);
  return { id: organization.id, slug: organization.slug, name: organization.name };
}

async function createSalon(organizationId: string, name: string) {
  const salon = await prisma.salon.create({
    data: { organizationId, name, slug: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, isActive: true },
  });
  createdSalonIds.push(salon.id);
  return salon;
}

async function createVisit(organizationId: string, salonId: string, customerId: string, amount: number) {
  const barber = await prisma.barber.create({
    data: {
      organizationId, salonId,
      name: `حلاق محفظة ${Math.random()}`,
      phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
      accessPinHash: "x",
      isActive: true,
    },
  });
  createdBarberIds.push(barber.id);
  const visit = await prisma.visit.create({
    data: {
      organizationId, salonId, customerId, barberId: barber.id,
      status: "COMPLETED",
      grossAmount: amount, netAmount: amount, paymentMethod: "CASH",
    },
  });
  createdVisitIds.push(visit.id);
  return visit;
}

async function createVerifiedAccount() {
  const national = `5${Math.floor(10000000 + Math.random() * 89999999)}`;
  const email = `wallet.${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
  const created = await prisma.customerAccount.create({
    data: {
      name: "منصور المحفظة",
      phone: toSaudiE164(`0${national}`),
      email,
      emailNormalized: normalizeEmail(email),
      emailVerifiedAt: new Date(),
    },
  });
  createdAccountIds.push(created.id);
  return created;
}

async function salonName(salonId: string) {
  return (await prisma.salon.findUniqueOrThrow({ where: { id: salonId }, select: { name: true } })).name;
}

function sourceFiles(roots: string[]) {
  const files: string[] = [];
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
    }
  };
  for (const root of roots) walk(join(process.cwd(), root));
  return files;
}
