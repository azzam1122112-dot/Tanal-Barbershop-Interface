import { PrismaClient } from "@prisma/client";
import { confirmVisit } from "@/lib/visits/visit-service";
import { updateVisitPaymentMethod } from "@/lib/visits/visit-admin-service";
import { generateWhatsAppMessage } from "@/lib/whatsapp/whatsapp-service";
import { hashBarberPin } from "@/lib/auth/barber-pin";
import { closeCashSession, openCashSession } from "@/lib/cash-sessions/cash-session-service";

const prisma = new PrismaClient();
const demoPrefix = "[DEMO]";

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
  await cleanupDemoData();
  const barber = await prisma.barber.create({
    data: {
      name: `${demoPrefix} حلاق تجربة`,
      phone: "966599990000",
      accessPinHash: await hashBarberPin("1234"),
      isActive: true,
    },
  });

  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }], take: 3 });
  if (services.length === 0) throw new Error("أضف خدمات قبل تشغيل demo seed");
  await openCashSession(prisma, { barberId: barber.id });

  const campaign = await prisma.campaign.create({
    data: {
      name: `${demoPrefix} حملة تجربة`,
      description: "حملة تجريبية للعرض الداخلي",
      discountType: "FIXED_AMOUNT",
      discountValue: 20,
      targetType: "ALL_CUSTOMERS",
      startAt: new Date(Date.now() - 60 * 60 * 1000),
      endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUsesPerCustomer: 2,
      isActive: true,
    },
  });

  const cashCustomer = await createDemoCustomer("عميل كاش", "966599990001", 0);
  const cardCustomer = await createDemoCustomer("عميل شبكة", "966599990002", 0);
  const rewardCustomer = await createDemoCustomer("عميل مكافأة", "966599990003", 700);
  const inactiveCustomer = await createDemoCustomer("عميل منقطع", "966599990004", 300);
  await prisma.customer.update({
    where: { id: inactiveCustomer.id },
    data: { visitCount: 1, lastVisitAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) },
  });

  const rewardRule = await prisma.rewardRule.findFirst({ where: { isActive: true, requiredPoints: { lte: 700 } }, orderBy: { requiredPoints: "desc" } });
  const cashVisit = await confirmVisit(prisma, {
    customerId: cashCustomer.id,
    barberId: barber.id,
    serviceIds: [services[0].id],
    grossAmount: 80,
    paymentMethod: "CASH",
    idempotencyKey: "demo-cash-visit",
  });
  await confirmVisit(prisma, {
    customerId: cardCustomer.id,
    barberId: barber.id,
    serviceIds: [services[0].id],
    grossAmount: 90,
    paymentMethod: "NETWORK",
    idempotencyKey: "demo-card-visit",
  });
  if (rewardRule) {
    await confirmVisit(prisma, {
      customerId: rewardCustomer.id,
      barberId: barber.id,
      serviceIds: [services[0].id],
      grossAmount: 100,
      paymentMethod: "CASH",
      rewardRuleId: rewardRule.id,
      idempotencyKey: "demo-reward-visit",
    });
  }
  await confirmVisit(prisma, {
    customerId: inactiveCustomer.id,
    barberId: barber.id,
    serviceIds: [services[0].id],
    grossAmount: 90,
    paymentMethod: "NETWORK",
    campaignId: campaign.id,
    idempotencyKey: "demo-campaign-visit",
  });

  const close = await closeCashSession(prisma, {
    barberId: barber.id,
    closedByUserId: admin.id,
    notes: `${demoPrefix} إغلاق تجربة`,
  });
  await updateVisitPaymentMethod(prisma, cashVisit.visit.id, "NETWORK", {
    actorUserId: admin.id,
    actorType: "ADMIN",
    reason: "تصحيح تجريبي بعد الإغلاق",
  });

  const template = await prisma.whatsAppTemplate.findFirst({ where: { type: "POST_VISIT", isActive: true } });
  if (template) {
    await generateWhatsAppMessage(
      prisma,
      { customerId: cashCustomer.id, templateId: template.id, visitId: cashVisit.visit.id },
      { actorUserId: admin.id, actorType: "ADMIN" },
    );
  }

  console.log(`Demo data created. Cash session: ${close.id}`);
}

async function cleanupDemoData() {
  const demoBarbers = await prisma.barber.findMany({ where: { OR: [{ name: { startsWith: demoPrefix } }, { phone: "966599990000" }] } });
  const barberIds = demoBarbers.map((barber) => barber.id);
  const demoCustomers = await prisma.customer.findMany({ where: { OR: [{ name: { startsWith: demoPrefix } }, { phone: { startsWith: "96659999" } }] } });
  const customerIds = demoCustomers.map((customer) => customer.id);
  const demoVisits = await prisma.visit.findMany({ where: { OR: [{ customerId: { in: customerIds } }, { barberId: { in: barberIds } }, { idempotencyKey: { startsWith: "demo-" } }] } });
  const visitIds = demoVisits.map((visit) => visit.id);
  const demoCampaigns = await prisma.campaign.findMany({ where: { name: { startsWith: demoPrefix } } });
  const campaignIds = demoCampaigns.map((campaign) => campaign.id);
  const demoMessages = await prisma.whatsAppMessageLog.findMany({ where: { customerId: { in: customerIds } } });
  const messageIds = demoMessages.map((message) => message.id);
  const demoCashSessions = await prisma.cashSession.findMany({ where: { barberId: { in: barberIds } } });
  const cashSessionIds = demoCashSessions.map((session) => session.id);
  const demoCloses = await prisma.dailyClose.findMany({ where: { OR: [{ barberId: { in: barberIds } }, { notes: { contains: demoPrefix } }] } });
  const closeIds = demoCloses.map((close) => close.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityId: { in: [...visitIds, ...customerIds, ...campaignIds, ...messageIds, ...closeIds, ...cashSessionIds, ...barberIds] } },
        { actorBarberId: { in: barberIds } },
      ],
    },
  });
  await prisma.whatsAppMessageLog.deleteMany({ where: { id: { in: messageIds } } });
  await prisma.session.deleteMany({ where: { barberId: { in: barberIds } } });
  await prisma.dailyClose.deleteMany({ where: { id: { in: closeIds } } });
  await prisma.campaignRedemption.deleteMany({ where: { OR: [{ visitId: { in: visitIds } }, { campaignId: { in: campaignIds } }] } });
  await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: visitIds } } });
  await prisma.visit.deleteMany({ where: { id: { in: visitIds } } });
  await prisma.cashSession.deleteMany({ where: { id: { in: cashSessionIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  await prisma.barber.deleteMany({ where: { id: { in: barberIds } } });
}

async function createDemoCustomer(name: string, phone: string, points: number) {
  return prisma.customer.create({
    data: {
      name: `${demoPrefix} ${name}`,
      phone,
      whatsappOptIn: true,
      loyaltyAccount: { create: { points, lifetimeEarned: points } },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
