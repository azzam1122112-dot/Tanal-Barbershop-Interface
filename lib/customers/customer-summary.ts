import type { Prisma } from "@prisma/client";

type CustomerWithSummary = Prisma.CustomerGetPayload<{
  include: {
    loyaltyAccount: true;
    visits: {
      include: {
        barber: true;
        services: true;
      };
    };
  };
}>;

export function toCustomerSummary(customer: CustomerWithSummary) {
  const lastVisit = customer.visits[0];

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    pointsBalance: customer.loyaltyAccount?.points ?? 0,
    visitsCount: customer.visitCount,
    whatsappOptIn: customer.whatsappOptIn,
    lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
    lastBarberName: lastVisit?.barber.name ?? null,
    lastServices: lastVisit?.services.map((service) => service.serviceName) ?? [],
  };
}

export function toCustomerDashboardRow(customer: Prisma.CustomerGetPayload<{ include: { loyaltyAccount: true } }>) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    pointsBalance: customer.loyaltyAccount?.points ?? 0,
    visitsCount: customer.visitCount,
    whatsappOptIn: customer.whatsappOptIn,
    lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
  };
}
