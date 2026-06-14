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
    expect(() => buildWhatsAppUrl("12345", "رسالة")).toThrow("رقم الجوال السعودي غير صحيح");
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
    expect(generated.waUrl).toContain("https://wa.me/9665");
    expect(decodeURIComponent(generated.waUrl)).toContain("مبلغ الزيارة 80");
    expect(JSON.stringify(generated)).not.toContain("passwordHash");
    expect(JSON.stringify(generated)).not.toContain("accessPinHash");
  });

  it("rejects message generation when customer disabled whatsapp", async () => {
    await expect(generateWhatsAppMessage(prisma, { customerId: optOutCustomerId, templateId }, adminMeta())).rejects.toThrow("العميل لا يرغب");
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

  it("lists inactive customers, reward-ready customers, campaign audience, and message logs", async () => {
    const inactive = await getInactiveWhatsAppAudience(prisma, 30);
    const rewards = await getRewardReadyWhatsAppAudience(prisma);
    const campaignAudience = await getCampaignWhatsAppAudience(prisma, campaignId);
    const logs = await getWhatsAppMessages(prisma, { customerId });

    expect(inactive.some((customer) => customer.customerId === inactiveCustomerId)).toBe(true);
    expect(rewards.some((customer) => customer.customerId === rewardCustomerId)).toBe(true);
    expect(campaignAudience.some((customer) => customer.customerId === customerId)).toBe(true);
    expect(logs.every((log) => log.customer.id === customerId)).toBe(true);
  });

  it("updates customer whatsapp preference and protects dashboard access", async () => {
    const updated = await updateCustomerWhatsappPreference(prisma, customerId, false, adminMeta());
    expect(updated.whatsappOptIn).toBe(false);
    await updateCustomerWhatsappPreference(prisma, customerId, true, adminMeta());
    expect(canAccessDashboard(null)).toBe(false);
    expect(canAccessDashboard({ type: "barber", id: "wa-b", role: "BARBER", barber: { id: barberId, name: "حلاق", phone: "966500000001", role: "BARBER" } })).toBe(false);
    expect(canAccessDashboard({ type: "dashboard", id: "wa-a", role: "ADMIN", user: { id: adminUserId, name: "مدير", email: "admin@tanal.local", role: "ADMIN" } })).toBe(true);
  });
});

async function createCustomer(name: string) {
  const result = await createCustomerWithLoyalty({
    prisma,
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
  return `9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}
