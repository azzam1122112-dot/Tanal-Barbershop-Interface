import { NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const auth = await requireOwnerApi();
  if (auth.response) return auth.response;
  if (!auth.session || auth.session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const organizationId = auth.session.organizationId;

  const [
    organization, salons, staffAssignments, users, barbers, customers, services, visits, appointments,
    rewards, loyaltyAccounts, loyaltyTransactions, campaigns, campaignRedemptions, managerRewards,
    products, stockMovements, dailyCloses, cashSessions, cashExpenses, attendanceRecords, settings,
    whatsappTemplates, whatsappMessages, whatsappSafetySettings, invoices, privacyRequests, auditLogs,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, city: true, slug: true, status: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true, inactiveSince: true, createdAt: true, updatedAt: true } }),
    prisma.salon.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.staffSalon.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { organizationId }, select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true } }),
    prisma.barber.findMany({ where: { organizationId }, select: { id: true, salonId: true, name: true, phone: true, commissionRate: true, isActive: true, createdAt: true, updatedAt: true } }),
    prisma.customer.findMany({ where: { organizationId }, select: { id: true, name: true, phone: true, whatsappTransactionalOptIn: true, whatsappMarketingOptIn: true, whatsappTransactionalConsentAt: true, whatsappMarketingConsentAt: true, whatsappOptOutAt: true, bookingNoShowCount: true, bookingBlockedAt: true, visitCount: true, totalPaid: true, lastVisitAt: true, createdAt: true, updatedAt: true } }),
    prisma.service.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.visit.findMany({ where: { organizationId }, include: { services: true, productLines: true }, orderBy: { visitedAt: "asc" } }),
    prisma.appointment.findMany({ where: { organizationId }, orderBy: { startAt: "asc" } }),
    prisma.rewardRule.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.loyaltyAccount.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.loyaltyTransaction.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.campaign.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.campaignRedemption.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.managerReward.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.product.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.stockMovement.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.dailyClose.findMany({ where: { organizationId }, orderBy: { date: "asc" } }),
    prisma.cashSession.findMany({ where: { organizationId }, orderBy: { openedAt: "asc" } }),
    prisma.cashExpense.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.attendanceRecord.findMany({ where: { organizationId }, orderBy: { checkInAt: "asc" } }),
    prisma.systemSettings.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.whatsAppTemplate.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.whatsAppMessageLog.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.whatsAppSafetySettings.findUnique({ where: { organizationId } }),
    prisma.billingInvoice.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.dataSubjectRequest.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } }),
  ]);

  const body = JSON.stringify({
    exportVersion: 2,
    exportedAt: new Date().toISOString(),
    notice: "نسخة شاملة لبيانات الحساب التشغيلية. استُبعدت فقط أسرار المصادقة ورموز الجلسات وروابط بوابات العملاء ومفاتيح وإحداثيات اشتراكات التنبيه لأنها بيانات أمنية وليست محتوى الحساب القابل للنقل.",
    organization,
    salons,
    staffAssignments,
    users,
    barbers,
    customers,
    services,
    visits,
    appointments,
    rewards,
    loyaltyAccounts,
    loyaltyTransactions,
    campaigns,
    campaignRedemptions,
    managerRewards,
    products,
    stockMovements,
    dailyCloses,
    cashSessions,
    cashExpenses,
    attendanceRecords,
    settings,
    whatsappTemplates,
    whatsappMessages,
    whatsappSafetySettings,
    subscriptionInvoices: invoices,
    privacyRequests,
    auditLogs,
  }, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="xmansx-data-export-${stamp}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
