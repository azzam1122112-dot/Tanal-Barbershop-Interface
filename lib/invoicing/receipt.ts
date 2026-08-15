import type { Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { getEffectiveSettings } from "@/lib/settings/system-settings";

export type ReceiptData = Awaited<ReturnType<typeof buildReceipt>>;

const receiptInclude = {
  customer: { include: { loyaltyAccount: true } },
  barber: true,
  services: true,
  productLines: true,
  salon: true,
  organization: true,
  loyaltyTransactions: true,
} satisfies Prisma.VisitInclude;

/**
 * يبني بيانات الإيصال الجاهزة للعرض.
 * يبني إيصال الزيارة التشغيلي من سجل العملية المحفوظ.
 */
export async function buildReceipt(
  prisma: PrismaClient,
  visitId: string,
  scope: { organizationId: string; salonIds?: string[] | null; barberId?: string; customerId?: string },
) {
  const visit = await prisma.visit.findFirst({
    where: {
      id: visitId,
      organizationId: scope.organizationId,
      ...(scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {}),
      ...(scope.barberId ? { barberId: scope.barberId } : {}),
      ...(scope.customerId ? { customerId: scope.customerId } : {}),
    },
    include: receiptInclude,
  });

  if (!visit) {
    throw new BusinessError("الزيارة غير موجودة", 404);
  }

  const settings = await getEffectiveSettings(prisma, {
    organizationId: visit.organizationId,
    salonId: visit.salonId,
  });

  const sellerName = settings?.legalName?.trim() || settings?.salonName || visit.salon?.name || "";

  const earnedPoints = visit.loyaltyTransactions
    .filter((transaction) => transaction.type === "EARN")
    .reduce((total, transaction) => total + transaction.points, 0);
  const redeemedPoints = Math.abs(
    visit.loyaltyTransactions
      .filter((transaction) => transaction.type === "REDEEM")
      .reduce((total, transaction) => total + transaction.points, 0),
  );

  return {
    visitId: visit.id,
    documentTitle: "إيصال مبيعات",
    seller: {
      name: sellerName,
      organizationName: visit.organization?.name ?? "",
      salonName: visit.salon?.name ?? settings?.salonName ?? "",
      city: visit.organization?.city ?? "",
    },
    invoiceNumber: visit.invoiceNumber,
    visitedAt: visit.visitedAt.toISOString(),
    status: visit.status,
    customer: visit.customer ? { name: visit.customer.name, phone: visit.customer.phone } : { name: "عميل زائر", phone: "" },
    barber: { name: visit.barber.name },
    services: [
      ...visit.services.map((service) => ({
        name: service.serviceName,
        quantity: service.quantity,
        unitPrice: Number(service.unitPrice),
        lineTotal: Number(service.lineTotal),
      })),
      // المنتجات تظهر كسطور في الفاتورة مثل الخدمات.
      ...visit.productLines.map((line) => ({
        name: line.productName,
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
      })),
    ],
    totals: {
      grossAmount: Number(visit.grossAmount),
      discountAmount: Number(visit.discountAmount),
      netAmount: Number(visit.netAmount),
    },
    paymentMethod: visit.paymentMethod,
    cashTenderedAmount: visit.cashTenderedAmount != null ? Number(visit.cashTenderedAmount) : null,
    cashChangeAmount: visit.cashChangeAmount != null ? Number(visit.cashChangeAmount) : null,
    loyalty: {
      earnedPoints,
      redeemedPoints,
      balance: visit.customer?.loyaltyAccount?.points ?? 0,
    },
  };
}
