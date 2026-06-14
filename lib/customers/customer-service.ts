import type { PrismaClient } from "@prisma/client";

export async function createCustomerWithLoyalty({
  prisma,
  name,
  phone,
  createdByBarberId,
}: {
  prisma: PrismaClient;
  name: string;
  phone: string;
  createdByBarberId?: string | null;
}) {
  const existing = await prisma.customer.findUnique({
    where: { phone },
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
      name,
      phone,
      createdByBarberId,
      loyaltyAccount: {
        create: {},
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
