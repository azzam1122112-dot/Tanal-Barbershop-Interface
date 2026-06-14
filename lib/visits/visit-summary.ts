import type { Prisma } from "@prisma/client";

type VisitWithDetails = Prisma.VisitGetPayload<{
  include: {
    customer: true;
    barber: true;
    services: true;
    cancelledBy: true;
  };
}>;

export function toVisitDashboardRow(visit: VisitWithDetails) {
  return {
    id: visit.id,
    visitedAt: visit.visitedAt.toISOString(),
    customer: {
      id: visit.customer.id,
      name: visit.customer.name,
      phone: visit.customer.phone,
    },
    barber: {
      id: visit.barber.id,
      name: visit.barber.name,
    },
    services: visit.services.map((service) => service.serviceName),
    grossAmount: Number(visit.grossAmount),
    discountAmount: Number(visit.discountAmount),
    netAmount: Number(visit.netAmount),
    paymentMethod: visit.paymentMethod,
    status: visit.status,
    cancelledAt: visit.cancelledAt?.toISOString() ?? null,
    cancelReason: visit.cancelReason,
    cancelledBy: visit.cancelledBy ? { id: visit.cancelledBy.id, name: visit.cancelledBy.name } : null,
    discountType: visit.discountType,
    pointsEarned: visit.pointsEarned,
    rewardRuleId: visit.discountType === "REWARD" ? visit.discountSourceId : null,
    campaignId: visit.discountType === "CAMPAIGN" ? visit.discountSourceId : null,
  };
}
