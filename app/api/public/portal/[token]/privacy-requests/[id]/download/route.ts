import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) return NextResponse.json({ message: "الرابط غير صالح أو منتهي" }, { status: 404 });

  const privacyRequest = await prisma.dataSubjectRequest.findFirst({
    where: {
      id,
      customerId: customer.id,
      organizationId: customer.organizationId,
      type: { in: ["ACCESS", "COPY"] },
      status: "COMPLETED",
      executedAt: { not: null },
      identityVerifiedAt: { not: null },
    },
    select: { id: true, type: true, createdAt: true, executedAt: true },
  });
  if (!privacyRequest) return NextResponse.json({ message: "النسخة غير متاحة لهذا الطلب" }, { status: 404 });

  const [profile, loyaltyAccount, loyaltyTransactions, visits, appointments, campaignRedemptions, managerRewards, whatsappMessages, requests] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customer.id },
      select: {
        id: true, name: true, phone: true, whatsappTransactionalOptIn: true, whatsappMarketingOptIn: true,
        whatsappTransactionalConsentAt: true, whatsappMarketingConsentAt: true, whatsappOptOutAt: true,
        privacyNoticeAcknowledgedAt: true, privacyNoticeVersion: true, privacyNoticeControllerName: true,
        bookingNoShowCount: true, bookingBlockedAt: true, bookingBlockReason: true, visitCount: true,
        totalPaid: true, lastVisitAt: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.loyaltyAccount.findUnique({ where: { customerId: customer.id } }),
    prisma.loyaltyTransaction.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "asc" } }),
    prisma.visit.findMany({
      where: { customerId: customer.id },
      include: { services: true, productLines: true, salon: { select: { name: true } } },
      orderBy: { visitedAt: "asc" },
    }),
    prisma.appointment.findMany({ where: { customerId: customer.id }, orderBy: { startAt: "asc" } }),
    prisma.campaignRedemption.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "asc" } }),
    prisma.managerReward.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "asc" } }),
    prisma.whatsAppMessageLog.findMany({
      where: { customerId: customer.id },
      select: { id: true, category: true, status: true, phone: true, message: true, openedAt: true, markedSentAt: true, skippedReason: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dataSubjectRequest.findMany({
      where: { customerId: customer.id },
      select: { id: true, type: true, status: true, details: true, requestedName: true, requestedPhone: true, identityVerifiedAt: true, executedAt: true, resolutionNote: true, resolvedAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const body = JSON.stringify({
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    controller: profile?.privacyNoticeControllerName ?? null,
    processor: "إكس مانس إكس XMANSX",
    profile,
    loyaltyAccount,
    loyaltyTransactions,
    visits,
    appointments,
    campaignRedemptions,
    managerRewards,
    whatsappMessages,
    privacyRequests: requests,
  }, null, 2);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-xmansx-data-${privacyRequest.id}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
