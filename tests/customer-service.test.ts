import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { toCustomerSummary } from "../lib/customers/customer-summary";

const prisma = new PrismaClient();
const unique = Date.now().toString().slice(-8);
const phone = `9665${unique}`;
let barberId = "";
let customerId = "";

describe("customer creation service", () => {
  beforeAll(async () => {
    const barber = await prisma.barber.findFirst();
    if (!barber) {
      throw new Error("Seed barber is required for customer service tests");
    }
    barberId = barber.id;
  });

  afterAll(async () => {
    if (customerId) {
      await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("creates a new customer and loyalty account", async () => {
    const result = await createCustomerWithLoyalty({
      prisma,
      name: "عميل اختبار",
      phone,
      createdByBarberId: barberId,
    });

    customerId = result.customer.id;

    expect(result.created).toBe(true);
    expect(result.customer.loyaltyAccount?.points).toBe(0);
    expect(result.customer.createdByBarberId).toBe(barberId);
  });

  it("prevents duplicate customers for the same phone", async () => {
    const result = await createCustomerWithLoyalty({
      prisma,
      name: "اسم آخر",
      phone,
      createdByBarberId: barberId,
    });

    expect(result.created).toBe(false);
    expect(result.customer.id).toBe(customerId);
  });

  it("returns a safe customer summary without sensitive data", async () => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: {
        loyaltyAccount: true,
        visits: {
          take: 1,
          include: { barber: true, services: true },
        },
      },
    });

    const summary = toCustomerSummary(customer);
    expect(summary).toMatchObject({ id: customerId, phone });
    expect("passwordHash" in summary).toBe(false);
    expect("accessPinHash" in summary).toBe(false);
  });
});
