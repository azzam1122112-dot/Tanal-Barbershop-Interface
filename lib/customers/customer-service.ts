import type { PrismaClient } from "@prisma/client";

export async function createCustomerWithLoyalty({
  prisma,
  organizationId,
  name,
  phone,
  createdByBarberId,
}: {
  prisma: PrismaClient;
  organizationId: string;
  name: string;
  phone: string;
  createdByBarberId?: string | null;
}) {
  const existing = await prisma.customer.findFirst({
    where: { organizationId, phone },
    include: {
      loyaltyAccount: true,
      visits: {
        orderBy: { visitedAt: "desc" },
        take: 1,
        include: { barber: true, services: true },
      },
    },
  });

  if (existing) {
    return { customer: existing, created: false };
  }

  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name,
      phone,
      createdByBarberId,
      loyaltyAccount: {
        create: { organizationId },
      },
    },
    include: {
      loyaltyAccount: true,
      visits: {
        orderBy: { visitedAt: "desc" },
        take: 1,
        include: { barber: true, services: true },
      },
    },
  });

  return { customer, created: true };
}
