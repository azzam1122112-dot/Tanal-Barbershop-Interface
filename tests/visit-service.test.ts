import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { canAccessDashboard } from "../lib/auth/access";
import { campaignCreateSchema } from "../lib/auth/validation";
import { buildVisitPreview, confirmVisit } from "../lib/visits/visit-service";
import { toVisitDashboardRow } from "../lib/visits/visit-summary";
import { openCashSession } from "../lib/cash-sessions/cash-session-service";

const prisma = new PrismaClient();
const createdCustomerIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];
const createdRewardRuleIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdBarberIds: string[] = [];
const createdCashSessionIds: string[] = [];
let barberId = "";
let customerId = "";
let rewardCustomerId = "";
let inactiveCustomerId = "";
let activeCustomerId = "";
let pointsCustomerId = "";
let activeServiceId = "";
let inactiveServiceId = "";
let rewardRuleId = "";
let inactiveRewardRuleId = "";

describe("visit preview and confirm", () => {
  beforeAll(async () => {
    const barber = await prisma.barber.create({
      data: {
        name: `visit-service-barber-${Date.now()}`,
        phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);
    const cashSession = await openCashSession(prisma, { barberId });
    createdCashSessionIds.push(cashSession.cashSession.id);

    const activeService = await prisma.service.create({
      data: { name: `visit-active-${Date.now()}`, defaultPrice: 25, sortOrder: 1, isActive: true },
    });
    const inactiveService = await prisma.service.create({
      data: { name: `visit-inactive-${Date.now()}`, defaultPrice: 35, sortOrder: 2, isActive: false },
    });
    createdServiceIds.push(activeService.id, inactiveService.id);
    activeServiceId = activeService.id;
    inactiveServiceId = inactiveService.id;

    const customerResult = await createCustomerWithLoyalty({
      prisma,
      organizationId: "org_default",
      name: "عميل زيارة",
      phone: `9665${Date.now().toString().slice(-8)}`,
      createdByBarberId: barberId,
    });
    customerId = customerResult.customer.id;
    createdCustomerIds.push(customerId);

    const rewardCustomer = await createCustomerWithLoyalty({
      prisma,
      organizationId: "org_default",
      name: "عميل مكافآت",
      phone: `9665${(Date.now() + 1).toString().slice(-8)}`,
      createdByBarberId: barberId,
    });
    rewardCustomerId = rewardCustomer.customer.id;
    createdCustomerIds.push(rewardCustomerId);
    await prisma.loyaltyAccount.update({
      where: { customerId: rewardCustomerId },
      data: { points: 520, lifetimeEarned: 520 },
    });

    const inactiveCustomer = await createCustomerWithLoyalty({
      prisma,
      organizationId: "org_default",
      name: "عميل منقطع",
      phone: `9665${(Date.now() + 2).toString().slice(-8)}`,
      createdByBarberId: barberId,
    });
    inactiveCustomerId = inactiveCustomer.customer.id;
    createdCustomerIds.push(inactiveCustomerId);
    await prisma.customer.update({
      where: { id: inactiveCustomerId },
      data: { visitCount: 1, lastVisitAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) },
    });

    const activeCustomer = await createCustomerWithLoyalty({
      prisma,
      organizationId: "org_default",
      name: "عميل نشط",
      phone: `9665${(Date.now() + 3).toString().slice(-8)}`,
      createdByBarberId: barberId,
    });
    activeCustomerId = activeCustomer.customer.id;
    createdCustomerIds.push(activeCustomerId);
    await prisma.customer.update({
      where: { id: activeCustomerId },
      data: { visitCount: 1, lastVisitAt: new Date() },
    });

    const pointsCustomer = await createCustomerWithLoyalty({
      prisma,
      organizationId: "org_default",
      name: "عميل نقاط للحملات",
      phone: `9665${(Date.now() + 4).toString().slice(-8)}`,
      createdByBarberId: barberId,
    });
    pointsCustomerId = pointsCustomer.customer.id;
    createdCustomerIds.push(pointsCustomerId);
    await prisma.loyaltyAccount.update({
      where: { customerId: pointsCustomerId },
      data: { points: 300, lifetimeEarned: 300 },
    });

    const rewardRule = await prisma.rewardRule.findFirstOrThrow({
      where: { requiredPoints: 500, isActive: true },
    });
    const inactiveRewardRule = await prisma.rewardRule.create({
      data: {
        name: `reward-inactive-${Date.now()}`,
        requiredPoints: 900000 + Math.floor(Math.random() * 100000),
        discountAmount: 5,
        isActive: false,
        sortOrder: 2,
      },
    });
    rewardRuleId = rewardRule.id;
    inactiveRewardRuleId = inactiveRewardRule.id;
    createdRewardRuleIds.push(inactiveRewardRuleId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...createdVisitIds, ...createdServiceIds, ...createdCustomerIds, ...createdCampaignIds, ...createdBarberIds] } },
          { actorBarberId: { in: createdBarberIds } },
        ],
      },
    });
    await prisma.campaignRedemption.deleteMany({ where: { campaignId: { in: createdCampaignIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdCashSessionIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.rewardRule.deleteMany({ where: { id: { in: createdRewardRuleIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("preview does not create a visit", async () => {
    const before = await prisma.visit.count({ where: { customerId, barberId } });
    const preview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 80,
      paymentMethod: "CASH",
    });
    const after = await prisma.visit.count({ where: { customerId, barberId } });

    expect(after).toBe(before);
    expect(preview.netAmount).toBe(80);
    expect(preview.discountAmount).toBe(0);
  });

  it("preview rejects zero or negative amount", async () => {
    await expect(
      buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId,
        barberId,
        serviceIds: [activeServiceId],
        grossAmount: 0,
        paymentMethod: "CASH",
      }),
    ).rejects.toThrow();
  });

  it("preview rejects empty serviceIds", async () => {
    await expect(
      buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId,
        barberId,
        serviceIds: [],
        grossAmount: 80,
        paymentMethod: "CASH",
      }),
    ).rejects.toThrow("اختر خدمة واحدة على الأقل");
  });

  it("preview rejects inactive services", async () => {
    await expect(
      buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId,
        barberId,
        serviceIds: [inactiveServiceId],
        grossAmount: 80,
        paymentMethod: "NETWORK",
      }),
    ).rejects.toThrow("كل الخدمات المختارة يجب أن تكون نشطة");
  });

  it("confirm creates visit, services, payment, points, loyalty transaction, and customer updates", async () => {
    const beforeCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { loyaltyAccount: true },
    });

    const result = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 90,
      paymentMethod: "NETWORK",
      idempotencyKey: `test-no-reward-${Date.now()}`,
    });
    createdVisitIds.push(result.visit.id);

    const visit = await prisma.visit.findUniqueOrThrow({
      where: { id: result.visit.id },
      include: { services: true, loyaltyTransactions: true },
    });
    const afterCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { loyaltyAccount: true },
    });

    expect(visit.services).toHaveLength(1);
    expect(visit.paymentMethod).toBe("NETWORK");
    expect(Number(visit.netAmount)).toBe(90);
    expect(Number(visit.grossAmount)).toBe(90);
    expect(visit.pointsEarned).toBe(90);
    expect(visit.loyaltyTransactions[0]?.type).toBe("EARN");
    expect(afterCustomer.loyaltyAccount?.points).toBe((beforeCustomer.loyaltyAccount?.points ?? 0) + 90);
    expect(afterCustomer.lastVisitAt).toBeTruthy();
    expect(afterCustomer.visitCount).toBe(beforeCustomer.visitCount + 1);
  });

  it("preview shows available rewards only when balance and amount allow it without changing points", async () => {
    const before = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId: rewardCustomerId } });
    const preview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: rewardCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
    });
    const after = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId: rewardCustomerId } });

    expect(preview.availableRewards.some((reward) => reward.id === rewardRuleId)).toBe(true);
    expect(after.points).toBe(before.points);
  });

  it("preview hides rewards when balance is insufficient or discount exceeds amount", async () => {
    const lowBalancePreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
    });
    const lowAmountPreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: rewardCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 20,
      paymentMethod: "CASH",
    });

    expect(lowBalancePreview.availableRewards.some((reward) => reward.id === rewardRuleId)).toBe(false);
    expect(lowAmountPreview.availableRewards.some((reward) => reward.id === rewardRuleId)).toBe(false);
  });

  it("confirm with reward redeems points, applies discount, earns on net, and is idempotent", async () => {
    const key = `reward-key-${Date.now()}`;
    const first = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: rewardCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
      rewardRuleId,
      idempotencyKey: key,
    });
    createdVisitIds.push(first.visit.id);

    const second = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: rewardCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
      rewardRuleId,
      idempotencyKey: key,
    });
    const visitsWithKey = await prisma.visit.count({ where: { barberId, idempotencyKey: key } });
    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { visitId: first.visit.id },
      orderBy: { createdAt: "asc" },
    });
    const account = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId: rewardCustomerId } });

    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.visit.id).toBe(first.visit.id);
    expect(visitsWithKey).toBe(1);
    expect(first.visit.discountAmount).toBe(25);
    expect(first.visit.netAmount).toBe(45);
    expect(first.visit.pointsEarned).toBe(45);
    expect(first.visit.redeemedPoints).toBe(500);
    expect(transactions.map((transaction) => transaction.type)).toEqual(["REDEEM", "EARN"]);
    expect(account.points).toBe(65);
  });

  it("confirm rejects inactive rewards, insufficient points, and discounts bigger than gross amount", async () => {
    await expect(
      confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId: rewardCustomerId,
        barberId,
        serviceIds: [activeServiceId],
        grossAmount: 70,
        paymentMethod: "CASH",
        rewardRuleId: inactiveRewardRuleId,
        idempotencyKey: `inactive-reward-${Date.now()}`,
      }),
    ).rejects.toThrow("المكافأة غير متاحة");

    await expect(
      confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId,
        barberId,
        serviceIds: [activeServiceId],
        grossAmount: 70,
        paymentMethod: "CASH",
        rewardRuleId,
        idempotencyKey: `insufficient-reward-${Date.now()}`,
      }),
    ).rejects.toThrow("رصيد النقاط غير كافٍ");

    await prisma.loyaltyAccount.update({
      where: { customerId: rewardCustomerId },
      data: { points: 520 },
    });

    await expect(
      confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId: rewardCustomerId,
        barberId,
        serviceIds: [activeServiceId],
        grossAmount: 20,
        paymentMethod: "CASH",
        rewardRuleId,
        idempotencyKey: `too-large-reward-${Date.now()}`,
      }),
    ).rejects.toThrow("قيمة الخصم أكبر من مبلغ الزيارة");
  });

  it("validates campaign creation rules", () => {
    const baseCampaign = {
      name: "حملة اختبار",
      discountType: "FIXED_AMOUNT",
      discountValue: 20,
      targetType: "ALL_CUSTOMERS",
      startAt: new Date(Date.now() - 1000).toISOString(),
      endAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      maxUsesPerCustomer: 1,
    };

    expect(campaignCreateSchema.safeParse(baseCampaign).success).toBe(true);
    expect(campaignCreateSchema.safeParse({ ...baseCampaign, discountType: "PERCENTAGE", discountValue: 10 }).success).toBe(true);
    expect(campaignCreateSchema.safeParse({ ...baseCampaign, discountType: "PERCENTAGE", discountValue: 101 }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...baseCampaign, endAt: new Date(Date.now() - 2000).toISOString() }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...baseCampaign, targetType: "INACTIVE_CUSTOMERS" }).success).toBe(false);
  });

  it("preview shows eligible campaigns and hides ineligible campaigns without saving redemption", async () => {
    const now = Date.now();
    const allCampaign = await createTestCampaign({
      name: "حملة كل العملاء",
      discountType: "FIXED_AMOUNT",
      discountValue: 20,
      targetType: "ALL_CUSTOMERS",
      startAt: new Date(now - 1000),
      endAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    const inactiveCampaign = await createTestCampaign({
      name: "حملة المنقطعين",
      discountType: "FIXED_AMOUNT",
      discountValue: 15,
      targetType: "INACTIVE_CUSTOMERS",
      inactiveDays: 30,
      startAt: new Date(now - 1000),
      endAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    const pointsCampaign = await createTestCampaign({
      name: "حملة النقاط",
      discountType: "FIXED_AMOUNT",
      discountValue: 10,
      targetType: "CUSTOMERS_WITH_MIN_POINTS",
      minPoints: 250,
      startAt: new Date(now - 1000),
      endAt: new Date(now + 24 * 60 * 60 * 1000),
    });

    const campaignIds = [allCampaign.id, inactiveCampaign.id, pointsCampaign.id];
    const before = await prisma.campaignRedemption.count({ where: { campaignId: { in: campaignIds } } });
    const normalPreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: activeCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
    });
    const inactivePreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: inactiveCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
    });
    const pointsPreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: pointsCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
    });
    const lowAmountPreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: activeCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 5,
      paymentMethod: "CASH",
    });
    const after = await prisma.campaignRedemption.count({ where: { campaignId: { in: campaignIds } } });

    expect(normalPreview.availableCampaigns.some((campaign) => campaign.id === allCampaign.id)).toBe(true);
    expect(normalPreview.availableCampaigns.some((campaign) => campaign.id === inactiveCampaign.id)).toBe(false);
    expect(inactivePreview.availableCampaigns.some((campaign) => campaign.id === inactiveCampaign.id)).toBe(true);
    expect(pointsPreview.availableCampaigns.some((campaign) => campaign.id === pointsCampaign.id)).toBe(true);
    expect(lowAmountPreview.availableCampaigns.some((campaign) => campaign.id === allCampaign.id)).toBe(false);
    expect(after).toBe(before);
  });

  it("preview hides inactive customers campaign when the customer is not inactive and hides campaigns after max usage", async () => {
    const now = Date.now();
    const inactiveCampaign = await createTestCampaign({
      name: "منقطع مرة واحدة",
      discountType: "FIXED_AMOUNT",
      discountValue: 10,
      targetType: "INACTIVE_CUSTOMERS",
      inactiveDays: 30,
      startAt: new Date(now - 1000),
      endAt: new Date(now + 24 * 60 * 60 * 1000),
      maxUsesPerCustomer: 1,
    });

    const activePreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: activeCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
    });
    expect(activePreview.availableCampaigns.some((campaign) => campaign.id === inactiveCampaign.id)).toBe(false);

    const result = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: inactiveCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
      campaignId: inactiveCampaign.id,
      idempotencyKey: `campaign-max-${Date.now()}`,
    });
    createdVisitIds.push(result.visit.id);

    await prisma.customer.update({
      where: { id: inactiveCustomerId },
      data: { lastVisitAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) },
    });

    const afterUsePreview = await buildVisitPreview(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: inactiveCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
    });
    expect(afterUsePreview.availableCampaigns.some((campaign) => campaign.id === inactiveCampaign.id)).toBe(false);
  });

  it("confirm applies fixed campaign discount, creates redemption, earns on net, and is idempotent", async () => {
    const campaign = await createTestCampaign({
      name: "خصم ثابت",
      discountType: "FIXED_AMOUNT",
      discountValue: 20,
      targetType: "ALL_CUSTOMERS",
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const beforeAccount = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });
    const key = `campaign-fixed-${Date.now()}`;

    const first = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
      campaignId: campaign.id,
      idempotencyKey: key,
    });
    createdVisitIds.push(first.visit.id);
    const second = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 70,
      paymentMethod: "CASH",
      campaignId: campaign.id,
      idempotencyKey: key,
    });
    const redemptions = await prisma.campaignRedemption.findMany({ where: { visitId: first.visit.id } });
    const transactions = await prisma.loyaltyTransaction.findMany({ where: { visitId: first.visit.id } });
    const afterAccount = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });

    expect(first.visit.discountType).toBe("CAMPAIGN");
    expect(first.visit.discountAmount).toBe(20);
    expect(first.visit.netAmount).toBe(50);
    expect(first.visit.pointsEarned).toBe(50);
    expect(first.visit.campaignId).toBe(campaign.id);
    expect(redemptions).toHaveLength(1);
    expect(transactions.map((transaction) => transaction.type)).toEqual(["EARN"]);
    expect(afterAccount.points).toBe(beforeAccount.points + 50);
    expect(second.idempotentReplay).toBe(true);
    expect(second.visit.id).toBe(first.visit.id);
    expect(await prisma.campaignRedemption.count({ where: { campaignId: campaign.id, customerId } })).toBe(1);
  });

  it("confirm applies percentage campaign, rejects reward plus campaign, inactive campaign, and expired campaign", async () => {
    const now = Date.now();
    const percentageCampaign = await createTestCampaign({
      name: "خصم نسبة",
      discountType: "PERCENTAGE",
      discountValue: 10,
      targetType: "ALL_CUSTOMERS",
      startAt: new Date(now - 1000),
      endAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    const inactiveCampaign = await createTestCampaign({
      name: "حملة معطلة",
      discountType: "FIXED_AMOUNT",
      discountValue: 5,
      targetType: "ALL_CUSTOMERS",
      isActive: false,
      startAt: new Date(now - 1000),
      endAt: new Date(now + 24 * 60 * 60 * 1000),
    });
    const expiredCampaign = await createTestCampaign({
      name: "حملة منتهية",
      discountType: "FIXED_AMOUNT",
      discountValue: 5,
      targetType: "ALL_CUSTOMERS",
      startAt: new Date(now - 48 * 60 * 60 * 1000),
      endAt: new Date(now - 24 * 60 * 60 * 1000),
    });

    const result = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId: pointsCustomerId,
      barberId,
      serviceIds: [activeServiceId],
      grossAmount: 80,
      paymentMethod: "NETWORK",
      campaignId: percentageCampaign.id,
      idempotencyKey: `campaign-percent-${Date.now()}`,
    });
    createdVisitIds.push(result.visit.id);

    expect(result.visit.discountAmount).toBe(8);
    expect(result.visit.netAmount).toBe(72);
    expect(result.visit.pointsEarned).toBe(72);

    await expect(
      confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId: rewardCustomerId,
        barberId,
        serviceIds: [activeServiceId],
        grossAmount: 70,
        paymentMethod: "CASH",
        rewardRuleId,
        campaignId: percentageCampaign.id,
        idempotencyKey: `campaign-and-reward-${Date.now()}`,
      }),
    ).rejects.toThrow("لا يمكن جمع مكافأة نقاط مع حملة");

    await expect(
      confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId,
        barberId,
        serviceIds: [activeServiceId],
        grossAmount: 70,
        paymentMethod: "CASH",
        campaignId: inactiveCampaign.id,
        idempotencyKey: `inactive-campaign-${Date.now()}`,
      }),
    ).rejects.toThrow("الحملة غير فعالة");

    await expect(
      confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
        customerId,
        barberId,
        serviceIds: [activeServiceId],
        grossAmount: 70,
        paymentMethod: "CASH",
        campaignId: expiredCampaign.id,
        idempotencyKey: `expired-campaign-${Date.now()}`,
      }),
    ).rejects.toThrow("الحملة خارج الفترة المحددة");
  });

  it("dashboard access rules block barber and anonymous users", () => {
    expect(canAccessDashboard(null)).toBe(false);
    expect(
      canAccessDashboard({
        type: "barber",
        id: "session-1",
        role: "BARBER",
        organizationId: "org_default",
        salonId: "salon_default",
        barber: { id: barberId, name: "حلاق", phone: "966500000002", role: "BARBER" },
      }),
    ).toBe(false);
    expect(
      canAccessDashboard({
        type: "dashboard",
        id: "session-2",
        role: "ADMIN",
        organizationId: "org_default",
        salonId: null,
        user: { id: "admin", name: "مدير", email: "admin@tanal.local", role: "ADMIN" },
      }),
    ).toBe(true);
  });

  it("dashboard visit response does not expose sensitive fields", async () => {
    const visit = await prisma.visit.findUniqueOrThrow({
      where: { id: createdVisitIds[0] },
      include: { customer: true, barber: true, services: true, cancelledBy: true },
    });
    const safe = toVisitDashboardRow(visit);

    expect("passwordHash" in safe).toBe(false);
    expect("accessPinHash" in safe).toBe(false);
    expect(safe.customer.phone).toBeTruthy();
  });
});

async function createTestCampaign(data: Parameters<typeof prisma.campaign.create>[0]["data"]) {
  const campaign = await prisma.campaign.create({ data });
  createdCampaignIds.push(campaign.id);
  return campaign;
}
