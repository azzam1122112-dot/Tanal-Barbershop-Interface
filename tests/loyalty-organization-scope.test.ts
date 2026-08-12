import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { openCashSession } from "../lib/cash-sessions/cash-session-service";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { getLoyaltyBalance, recordLoyaltyMovement } from "../lib/loyalty/ledger";
import { getLoyaltyProgramReport } from "../lib/reports/loyalty-report";
import { getEffectiveSettings } from "../lib/settings/system-settings";
import { cancelVisit, updateVisitAmount } from "../lib/visits/visit-admin-service";
import { confirmVisit } from "../lib/visits/visit-service";

/**
 * نطاق برنامج الولاء = المؤسسة، وموقع الحركة = الفرع.
 *
 * هذه الاختبارات تثبّت القاعدة بعد أن صارت مكتوبة صراحةً في الدفتر: عضوية واحدة
 * للعميل داخل مؤسسته مهما تعدّدت الفروع، ورصيد واحد تكتب فيه كل الفروع، وحركة
 * تحمل فرعها لأغراض التقرير لا لتحديد رصيد.
 */

const prisma = new PrismaClient();
const ORG = "org_default";
const RIYADH = "salon_default";

const createdVisitIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdBarberIds: string[] = [];
const createdServiceIds: string[] = [];
const createdSalonIds: string[] = [];
const createdCashSessionIds: string[] = [];
const createdRewardRuleIds: string[] = [];
const createdSettingsIds: string[] = [];
let otherOrganizationId = "";
let otherSalonId = "";
let adminUserId = "";

let jeddahId = "";
let dammamId = "";
let riyadhBarberId = "";
let jeddahBarberId = "";
let dammamBarberId = "";
let riyadhServiceId = "";
let jeddahServiceId = "";
let dammamServiceId = "";
let memberId = "";

describe("loyalty scope is the organization, not the branch", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { organizationId: ORG, role: "ADMIN", isActive: true } })).id;
    const plan = (await prisma.organization.findUniqueOrThrow({ where: { id: ORG }, select: { planId: true } })).planId;

    jeddahId = (await createSalon("جدة")).id;
    dammamId = (await createSalon("الدمام")).id;

    [riyadhBarberId, jeddahBarberId, dammamBarberId] = await Promise.all([
      createBarber(RIYADH), createBarber(jeddahId), createBarber(dammamId),
    ]);
    [riyadhServiceId, jeddahServiceId, dammamServiceId] = await Promise.all([
      createService(RIYADH), createService(jeddahId), createService(dammamId),
    ]);
    for (const barberId of [riyadhBarberId, jeddahBarberId, dammamBarberId]) {
      createdCashSessionIds.push((await openCashSession(prisma, { barberId })).cashSession.id);
    }

    // مؤسسة ثانية بفرعها — لإثبات استقلال الأرصدة ومنع عبور المستأجرين.
    const otherOrganization = await prisma.organization.create({
      data: { name: "مؤسسة مجاورة", slug: `loyalty-scope-${Date.now()}`, planId: plan, subscriptionStatus: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
    });
    otherOrganizationId = otherOrganization.id;
    otherSalonId = (await prisma.salon.create({ data: { organizationId: otherOrganizationId, name: "فرع مجاور", slug: "main", isActive: true } })).id;

    memberId = (await createMember("عميل متعدد الفروع")).id;
  }, 60000);

  afterAll(async () => {
    const customerIds = createdCustomerIds;
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...createdVisitIds, ...customerIds] } }, { actorBarberId: { in: createdBarberIds } }, { organizationId: otherOrganizationId }] } });
    await prisma.loyaltyTransaction.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdCashSessionIds } } });
    await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.rewardRule.deleteMany({ where: { id: { in: createdRewardRuleIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    // آثار الفرع التشغيلية التي تنشأ تلقائيًا مع الزيارة النقدية وترقيم الفواتير.
    await prisma.cashCustodyMovement.deleteMany({ where: { salonId: { in: createdSalonIds } } });
    await prisma.barberCashBalance.deleteMany({ where: { salonId: { in: createdSalonIds } } });
    await prisma.branchCashSafe.deleteMany({ where: { salonId: { in: createdSalonIds } } });
    await prisma.invoiceCounter.deleteMany({ where: { salonId: { in: createdSalonIds } } });
    await prisma.systemSettings.deleteMany({ where: { id: { in: createdSettingsIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.salon.deleteMany({ where: { id: { in: createdSalonIds } } });
    await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
    await prisma.$disconnect();
  }, 60000);

  it("creates exactly one membership on enrolment, scoped to the organization", async () => {
    const accounts = await prisma.loyaltyAccount.findMany({ where: { customerId: memberId } });

    expect(accounts).toHaveLength(1);
    expect(accounts[0].organizationId).toBe(ORG);
    expect(accounts[0].points).toBe(0);
  });

  it("accumulates points from three branches into one organization balance", async () => {
    await earn(RIYADH, riyadhBarberId, riyadhServiceId, 100);
    await earn(jeddahId, jeddahBarberId, jeddahServiceId, 200);
    await earn(dammamId, dammamBarberId, dammamServiceId, 50);

    const accounts = await prisma.loyaltyAccount.findMany({ where: { customerId: memberId } });
    // زيارة فرع ثانٍ وثالث لم تنشئ عضوية جديدة.
    expect(accounts).toHaveLength(1);
    expect(accounts[0].points).toBe(350);
    expect(accounts[0].lifetimeEarned).toBe(350);
  });

  it("records the branch of every movement without splitting the balance", async () => {
    const ledger = await prisma.loyaltyTransaction.findMany({
      where: { customerId: memberId, type: "EARN" },
      orderBy: { createdAt: "asc" },
    });

    expect(ledger.map((row) => [row.salonId, row.points])).toEqual([
      [RIYADH, 100],
      [jeddahId, 200],
      [dammamId, 50],
    ]);
    // سلسلة الرصيد مقروءة من الدفتر وحده بلا إعادة حساب.
    expect(ledger.map((row) => [row.balanceBefore, row.balanceAfter])).toEqual([[0, 100], [100, 300], [300, 350]]);
    expect(ledger.every((row) => row.organizationId === ORG)).toBe(true);
    expect(ledger.every((row) => row.recordedByBarberId !== null)).toBe(true);
  });

  it("redeems points earned elsewhere at a different branch of the same organization", async () => {
    const reward = await prisma.rewardRule.create({
      data: { organizationId: ORG, name: `مكافأة اختبار النطاق ${Date.now()}`, requiredPoints: 150, discountAmount: 20, isActive: true, sortOrder: 900 },
    });
    createdRewardRuleIds.push(reward.id);

    // كُسبت النقاط في الرياض وجدة والدمام، وتُستبدل في جدة.
    await earn(jeddahId, jeddahBarberId, jeddahServiceId, 60, reward.id);

    const balance = await getLoyaltyBalance(prisma, memberId);
    const redeem = await prisma.loyaltyTransaction.findFirstOrThrow({ where: { customerId: memberId, type: "REDEEM" } });

    expect(redeem.salonId).toBe(jeddahId);
    expect(redeem.points).toBe(-150);
    expect(redeem.balanceBefore).toBe(350);
    expect(redeem.balanceAfter).toBe(200);
    // 350 − 150 استبدال + 40 نقطة على المبلغ بعد الخصم (60 − 20).
    expect(balance).toBe(240);
  });

  it("keeps a second organization's membership and balance fully independent", async () => {
    const phone = uniquePhone();
    const here = await createMember("عميل بمؤسستين", phone);
    const there = await createMember("عميل بمؤسستين", phone, otherOrganizationId);

    await recordLoyaltyMovement(prisma, {
      organizationId: otherOrganizationId,
      customerId: there.id,
      salonId: otherSalonId,
      type: "ADJUST",
      points: 320,
      description: "رصيد افتتاحي في المؤسسة الثانية",
    });

    // نفس الرقم، سجلان مستقلان، رصيدان لا يتقاطعان.
    expect(there.id).not.toBe(here.id);
    expect(await getLoyaltyBalance(prisma, here.id)).toBe(0);
    expect(await getLoyaltyBalance(prisma, there.id)).toBe(320);
  });

  it("rejects a branch that belongs to another organization", async () => {
    await expect(
      recordLoyaltyMovement(prisma, {
        organizationId: ORG,
        customerId: memberId,
        salonId: otherSalonId,
        type: "ADJUST",
        points: 10,
        description: "فرع من مؤسسة أخرى",
      }),
    ).rejects.toThrow("الفرع لا يتبع مؤسسة العميل");

    // ولا العكس: عضوية هذه المؤسسة لا تُستدعى بمعرّف مؤسسة أخرى.
    await expect(
      recordLoyaltyMovement(prisma, {
        organizationId: otherOrganizationId,
        customerId: memberId,
        salonId: otherSalonId,
        type: "ADJUST",
        points: 10,
        description: "عضوية مؤسسة أخرى",
      }),
    ).rejects.toThrow("العميل غير مشترك في برنامج الولاء");
  });

  it("reverses a cancelled visit against the branch where it happened", async () => {
    const visitId = await earn(dammamId, dammamBarberId, dammamServiceId, 50);
    const before = (await getLoyaltyBalance(prisma, memberId)) ?? 0;

    await cancelVisit(prisma, visitId, { actorUserId: adminUserId, actorType: "ADMIN", reason: "اختبار عكس" });

    const reversal = await prisma.loyaltyTransaction.findFirstOrThrow({ where: { visitId, type: "REVERSAL" } });
    expect(reversal.salonId).toBe(dammamId);
    expect(reversal.points).toBe(-50);
    expect(reversal.recordedByUserId).toBe(adminUserId);
    expect(await getLoyaltyBalance(prisma, memberId)).toBe(before - 50);
    // الحركة الأصلية باقية كما هي — التصحيح بحركة مقابلة لا بحذف.
    expect(await prisma.loyaltyTransaction.count({ where: { visitId, type: "EARN" } })).toBe(1);
  });

  it("never enrols a customer as a side effect of reading or adjusting", async () => {
    const guest = await createCustomerWithLoyalty({ prisma, organizationId: ORG, name: `عميل بلا ولاء ${Date.now()}`, phone: uniquePhone(), enrollInLoyalty: false });
    createdCustomerIds.push(guest.customer.id);
    const visitId = await earn(RIYADH, riyadhBarberId, riyadhServiceId, 70, undefined, guest.customer.id);

    expect(await getLoyaltyBalance(prisma, guest.customer.id)).toBeNull();

    await updateVisitAmount(prisma, visitId, 90, { actorUserId: adminUserId, actorType: "ADMIN", reason: "تعديل مبلغ لعميل غير مشترك" });
    await cancelVisit(prisma, visitId, { actorUserId: adminUserId, actorType: "ADMIN", reason: "إلغاء لعميل غير مشترك" });

    // قراءة الرصيد وتعديل الزيارة وإلغاؤها: لا شيء منها يُدخل العميل في البرنامج.
    expect(await prisma.loyaltyAccount.count({ where: { customerId: guest.customer.id } })).toBe(0);
    expect(await prisma.loyaltyTransaction.count({ where: { customerId: guest.customer.id } })).toBe(0);
  });

  it("does not double-credit points when the same visit is retried", async () => {
    const key = `loyalty-scope-idempotent-${Date.now()}`;
    const before = (await getLoyaltyBalance(prisma, memberId)) ?? 0;
    const input = {
      organizationId: ORG, salonId: RIYADH, customerId: memberId, barberId: riyadhBarberId,
      serviceIds: [riyadhServiceId], grossAmount: 100, paymentMethod: "CASH" as const, idempotencyKey: key,
    };

    await prisma.service.update({ where: { id: riyadhServiceId }, data: { defaultPrice: 100 } });
    const first = await confirmVisit(prisma, input);
    const replay = await confirmVisit(prisma, input);
    createdVisitIds.push(first.visit.id);

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.visit.id).toBe(first.visit.id);
    expect(await getLoyaltyBalance(prisma, memberId)).toBe(before + 100);
    expect(await prisma.loyaltyTransaction.count({ where: { visitId: first.visit.id, type: "EARN" } })).toBe(1);
  });

  it("loses no points when two branches write concurrently", async () => {
    const before = (await getLoyaltyBalance(prisma, memberId)) ?? 0;

    await Promise.all([
      earn(jeddahId, jeddahBarberId, jeddahServiceId, 30),
      earn(dammamId, dammamBarberId, dammamServiceId, 40),
    ]);

    expect(await getLoyaltyBalance(prisma, memberId)).toBe(before + 70);
  }, 30000);

  it("reports branch activity without ever scoping the balance to a branch", async () => {
    const range = { from: new Date(Date.now() - 24 * 60 * 60 * 1000), to: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    const all = await getLoyaltyProgramReport(prisma, { organizationId: ORG, salonIds: null, ...range });
    const jeddahOnly = await getLoyaltyProgramReport(prisma, { organizationId: ORG, salonIds: [jeddahId], ...range });
    const jeddahRow = all.branches.find((branch) => branch.salonId === jeddahId);

    // النشاط يتبع الفلتر...
    expect(jeddahRow).toBeDefined();
    expect(jeddahOnly.activity.pointsEarned).toBe(jeddahRow?.pointsEarned);
    expect(jeddahOnly.activity.pointsRedeemed).toBe(jeddahRow?.pointsRedeemed);
    expect(jeddahOnly.branches.map((branch) => branch.salonId)).toEqual([jeddahId]);
    expect(all.activity.pointsEarned).toBeGreaterThan(jeddahOnly.activity.pointsEarned);

    // ...والبرنامج لا يتبعه: نفس الأعضاء ونفس الرصيد القائم مهما ضاق الفلتر.
    expect(jeddahOnly.program.members).toBe(all.program.members);
    expect(jeddahOnly.program.outstandingPoints).toBe(all.program.outstandingPoints);
    expect(all.branches.map((branch) => branch.salonId)).toEqual(expect.arrayContaining([RIYADH, jeddahId, dammamId]));
    expect(all.topCustomers.some((customer) => customer.customerId === memberId)).toBe(true);
  });

  it("treats branch loyalty settings as an override of the organization default", async () => {
    const inherited = await getEffectiveSettings(prisma, { organizationId: ORG, salonId: jeddahId });
    const organization = await getEffectiveSettings(prisma, { organizationId: ORG });

    // فرع بلا تجاوز يرث صف المؤسسة نفسه — لا برنامج ولاء مستقلًا.
    expect(await prisma.systemSettings.count({ where: { salonId: jeddahId } })).toBe(0);
    expect(inherited?.id).toBe(organization?.id);

    const override = await prisma.systemSettings.create({
      data: { organizationId: ORG, salonId: jeddahId, salonName: "جدة", pointsPerCurrencyUnit: 3 },
    });
    createdSettingsIds.push(override.id);
    const overridden = await getEffectiveSettings(prisma, { organizationId: ORG, salonId: jeddahId });
    const untouched = await getEffectiveSettings(prisma, { organizationId: ORG, salonId: dammamId });

    // التجاوز يغيّر معدّل الكسب في فرعه وحده، ولا يمسّ الرصيد ولا العضوية.
    expect(Number(overridden?.pointsPerCurrencyUnit)).toBe(3);
    expect(untouched?.id).toBe(organization?.id);
    expect(await prisma.loyaltyAccount.count({ where: { customerId: memberId } })).toBe(1);
  });
});

async function createSalon(name: string) {
  const salon = await prisma.salon.create({
    data: { organizationId: ORG, name: `${name} ${Date.now()}`, slug: `loyalty-scope-${name}-${Date.now()}`, isActive: true },
  });
  createdSalonIds.push(salon.id);
  return salon;
}

async function createBarber(salonId: string) {
  const barber = await prisma.barber.create({
    data: {
      organizationId: ORG,
      salonId,
      name: `حلاق نطاق الولاء ${Date.now()} ${Math.random()}`,
      phone: uniquePhone(),
      accessPinHash: await hashBarberPin("Tanal@123"),
      isActive: true,
    },
  });
  createdBarberIds.push(barber.id);
  return barber.id;
}

async function createService(salonId: string) {
  const service = await prisma.service.create({
    data: { organizationId: ORG, salonId, name: `خدمة نطاق الولاء ${Date.now()} ${Math.random()}`, defaultPrice: 100, isActive: true, sortOrder: 900 },
  });
  createdServiceIds.push(service.id);
  return service.id;
}

async function createMember(name: string, phone = uniquePhone(), organizationId = ORG) {
  const result = await createCustomerWithLoyalty({ prisma, organizationId, name, phone });
  createdCustomerIds.push(result.customer.id);
  return result.customer;
}

/** زيارة مؤكَّدة في فرع محدد. تعيد معرّف الزيارة. */
async function earn(salonId: string, barberId: string, serviceId: string, grossAmount: number, rewardRuleId?: string, customerId = memberId) {
  await prisma.service.update({ where: { id: serviceId }, data: { defaultPrice: grossAmount } });
  const result = await confirmVisit(prisma, {
    organizationId: ORG,
    salonId,
    customerId,
    barberId,
    serviceIds: [serviceId],
    grossAmount,
    paymentMethod: "CASH",
    rewardRuleId,
    idempotencyKey: `loyalty-scope-${Date.now()}-${Math.random()}`,
  });
  createdVisitIds.push(result.visit.id);
  return result.visit.id;
}

function uniquePhone() {
  return `9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}
