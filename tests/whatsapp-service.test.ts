import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { canAccessDashboard } from "../lib/auth/access";
import { openCashSession } from "../lib/cash-sessions/cash-session-service";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { confirmVisit } from "../lib/visits/visit-service";
import {
  buildWhatsAppUrl,
  createWhatsAppTemplate,
  generateWhatsAppMessage,
  getCampaignWhatsAppAudience,
  getInactiveWhatsAppAudience,
  getRewardReadyWhatsAppAudience,
  getWhatsAppMessages,
  markWhatsAppMessageOpened,
  markWhatsAppMessageSent,
  renderWhatsAppTemplate,
  updateCustomerWhatsappPreference,
} from "../lib/whatsapp/whatsapp-service";

const prisma = new PrismaClient();
const createdCustomerIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdBarberIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdMessageIds: string[] = [];
const createdCashSessionIds: string[] = [];

let adminUserId = "";
let barberId = "";
let serviceId = "";
let customerId = "";
let optOutCustomerId = "";
let inactiveCustomerId = "";
let rewardCustomerId = "";
let managerRewardCustomerId = "";
let visitId = "";
let templateId = "";
let campaignId = "";

describe("whatsapp templates and message logs", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;
    const barber = await prisma.barber.create({
      data: {
        name: `whatsapp-barber-${Date.now()}`,
        phone: randomSaudiPhone(),
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId })).cashSession.id);

    const service = await prisma.service.create({
      data: { name: `خدمة واتساب ${Date.now()}`, defaultPrice: 50, isActive: true, sortOrder: 400 },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);

    customerId = (await createCustomer("عميل واتساب")).customer.id;
    optOutCustomerId = (await createCustomer("عميل لا يريد واتساب")).customer.id;
    inactiveCustomerId = (await createCustomer("عميل منقطع واتساب")).customer.id;
    rewardCustomerId = (await createCustomer("عميل مكافأة واتساب")).customer.id;
    managerRewardCustomerId = (await createCustomer("عميل مكافأة إدارية واتساب")).customer.id;

    await prisma.customer.update({
      where: { id: optOutCustomerId },
      data: { whatsappOptIn: false },
    });
    await prisma.customer.update({
      where: { id: inactiveCustomerId },
      data: { visitCount: 1, lastVisitAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) },
    });
    await prisma.loyaltyAccount.update({
      where: { customerId: rewardCustomerId },
      data: { points: 700, lifetimeEarned: 700 },
    });
    await prisma.managerReward.create({
      data: {
        customerId: managerRewardCustomerId,
        issuedByUserId: adminUserId,
        title: "هدية عودة",
        discountAmount: 30,
        description: "عميل منقطع",
      },
    });

    const template = await createWhatsAppTemplate(
      prisma,
      {
        name: `قالب واتساب اختبار ${Date.now()}`,
        type: "POST_VISIT",
        body: "أهلًا {name} رصيدك {points} ومبلغ الزيارة {visit_net_amount} و {unknown}",
      },
      adminMeta(),
    );
    templateId = template.id;
    createdTemplateIds.push(templateId);

    const visit = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
      customerId,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 80,
      paymentMethod: "CASH",
      idempotencyKey: `whatsapp-visit-${Date.now()}`,
    });
    visitId = visit.visit.id;
    createdVisitIds.push(visitId);

    const campaign = await prisma.campaign.create({
      data: {
        name: `حملة واتساب ${Date.now()}`,
        discountType: "FIXED_AMOUNT",
        discountValue: 20,
        targetType: "ALL_CUSTOMERS",
        startAt: new Date(Date.now() - 60 * 1000),
        endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        maxUsesPerCustomer: 1,
        isActive: true,
      },
    });
    campaignId = campaign.id;
    createdCampaignIds.push(campaignId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...createdMessageIds, ...createdTemplateIds, ...createdVisitIds, ...createdCampaignIds, ...createdCustomerIds, ...createdServiceIds, ...createdBarberIds] } },
          { actorBarberId: { in: createdBarberIds } },
        ],
      },
    });
    await prisma.whatsAppMessageLog.deleteMany({ where: { id: { in: createdMessageIds } } });
    await prisma.whatsAppTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
    await prisma.campaignRedemption.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdCashSessionIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("builds a valid encoded wa.me url and rejects invalid phone numbers", () => {
    const url = buildWhatsAppUrl("05 1234 5678", "أهلًا عميل");
    expect(url).toBe(`https://wa.me/966512345678?text=${encodeURIComponent("أهلًا عميل")}`);
    expect(() => buildWhatsAppUrl("12345", "رسالة")).toThrow("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
  });

  it("renders known variables and removes unknown placeholders", () => {
    const message = renderWhatsAppTemplate("أهلًا {name} {points} {bad_variable}", {
      name: "<عميل>",
      points: 520,
    });
    expect(message).toBe("أهلًا عميل 520 ");
  });

  it("generates a drafted message log from a visit without exposing sensitive data", async () => {
    const generated = await generateWhatsAppMessage(prisma, { customerId, templateId, visitId }, adminMeta());
    createdMessageIds.push(generated.messageLogId);

    const log = await prisma.whatsAppMessageLog.findUniqueOrThrow({ where: { id: generated.messageLogId } });
    expect(generated.status).toBe("DRAFTED");
    expect(log.status).toBe("DRAFTED");
    expect(log.phone).toMatch(/^05\d{8}$/);
    expect(generated.phone).toBe(log.phone);
    expect(generated.waUrl).toContain("https://wa.me/9665");
    expect(generated.waUrl).toContain(`https://wa.me/966${log.phone.slice(1)}`);
    expect(decodeURIComponent(generated.waUrl)).toContain("مبلغ الزيارة 80");
    expect(JSON.stringify(generated)).not.toContain("passwordHash");
    expect(JSON.stringify(generated)).not.toContain("accessPinHash");
  });

  it("rejects message generation when customer disabled whatsapp", async () => {
    await expect(generateWhatsAppMessage(prisma, { customerId: optOutCustomerId, templateId }, adminMeta())).rejects.toThrow("العميل لا يرغب");
  });

  it("rejects message generation when whatsapp is disabled in system settings", async () => {
    const settings = await prisma.systemSettings.findUniqueOrThrow({ where: { salonId: "salon_default" } });
    await prisma.systemSettings.update({
      where: { salonId: "salon_default" },
      data: { whatsappEnabled: false },
    });

    try {
      await expect(generateWhatsAppMessage(prisma, { customerId, templateId }, adminMeta())).rejects.toThrow("واتساب معطل من إعدادات النظام");
    } finally {
      await prisma.systemSettings.update({
        where: { salonId: "salon_default" },
        data: { whatsappEnabled: settings.whatsappEnabled },
      });
    }
  });

  it("updates opened and marked sent statuses and writes audit logs", async () => {
    const generated = await generateWhatsAppMessage(prisma, { customerId, templateId }, adminMeta());
    createdMessageIds.push(generated.messageLogId);
    const opened = await markWhatsAppMessageOpened(prisma, generated.messageLogId, adminMeta());
    const sent = await markWhatsAppMessageSent(prisma, generated.messageLogId, adminMeta());

    expect(opened.status).toBe("OPENED");
    expect(sent.status).toBe("MARKED_SENT");
    expect(await prisma.auditLog.count({ where: { action: "whatsapp.message_opened", entityId: generated.messageLogId } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: "whatsapp.message_marked_sent", entityId: generated.messageLogId } })).toBeGreaterThan(0);
  });

  it("renders manager reward variables for reward messages without requiring loyalty points", async () => {
    const generated = await generateWhatsAppMessage(
      prisma,
      {
        customerId: managerRewardCustomerId,
        customMessage: "لديك {manager_reward_title} بقيمة {reward_discount} ريال",
      },
      adminMeta(),
    );
    createdMessageIds.push(generated.messageLogId);

    expect(generated.message).toContain("هدية عودة");
    expect(generated.message).toContain("30 ريال");
  });

  it("lists inactive customers, reward-ready customers, campaign audience, and message logs", async () => {
    const inactive = await getInactiveWhatsAppAudience(prisma, 30);
    const rewards = await getRewardReadyWhatsAppAudience(prisma);
    const campaignAudience = await getCampaignWhatsAppAudience(prisma, campaignId);
    const logs = await getWhatsAppMessages(prisma, { customerId });

    expect(inactive.some((customer) => customer.customerId === inactiveCustomerId)).toBe(true);
    expect(rewards.some((customer) => customer.customerId === rewardCustomerId)).toBe(true);
    expect(rewards.some((customer) => customer.customerId === managerRewardCustomerId)).toBe(true);
    expect(campaignAudience.some((customer) => customer.customerId === customerId)).toBe(true);
    expect(logs.every((log) => log.customer.id === customerId)).toBe(true);
  });

  it("updates customer whatsapp preference and protects dashboard access", async () => {
    const updated = await updateCustomerWhatsappPreference(prisma, customerId, false, adminMeta());
    expect(updated.whatsappOptIn).toBe(false);
    await updateCustomerWhatsappPreference(prisma, customerId, true, adminMeta());
    expect(canAccessDashboard(null)).toBe(false);
    expect(canAccessDashboard({ type: "barber", id: "wa-b", role: "BARBER", organizationId: "org_default", salonId: "salon_default", barber: { id: barberId, name: "حلاق", phone: "0500000001", role: "BARBER" } })).toBe(false);
    expect(canAccessDashboard({ type: "dashboard", id: "wa-a", role: "ADMIN", organizationId: "org_default", salonId: null, user: { id: adminUserId, name: "مدير", email: "admin@tanal.local", role: "ADMIN" } })).toBe(true);
  });
});

async function createCustomer(name: string) {
  const result = await createCustomerWithLoyalty({
    prisma,
    organizationId: "org_default",
    name,
    phone: randomSaudiPhone(),
    createdByBarberId: barberId,
  });
  createdCustomerIds.push(result.customer.id);
  return result;
}

function adminMeta() {
  return {
    actorUserId: adminUserId,
    actorType: "ADMIN" as const,
  };
}

function randomSaudiPhone() {
  return `05${Math.floor(10000000 + Math.random() * 89999999)}`;
}
