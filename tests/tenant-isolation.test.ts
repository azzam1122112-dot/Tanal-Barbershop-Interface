import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { createManagerReward } from "../lib/manager-rewards/manager-reward-service";

const prisma = new PrismaClient();

const orgIds: string[] = [];
const customerIds: string[] = [];
const sharedPhone = "966599887766";

async function makeOrg(slug: string) {
  const org = await prisma.organization.create({
    data: { name: `org-${slug}-${Date.now()}`, slug: `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  });
  orgIds.push(org.id);
  return org.id;
}

describe("tenant isolation", () => {
  afterAll(async () => {
    await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.$disconnect();
  });

  it("allows the same customer phone in two different organizations", async () => {
    const orgA = await makeOrg("a");
    const orgB = await makeOrg("b");

    const a = await createCustomerWithLoyalty({ prisma, organizationId: orgA, name: "عميل أ", phone: sharedPhone });
    const b = await createCustomerWithLoyalty({ prisma, organizationId: orgB, name: "عميل ب", phone: sharedPhone });
    customerIds.push(a.customer.id, b.customer.id);

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.customer.id).not.toBe(b.customer.id);
    expect(a.customer.organizationId).toBe(orgA);
    expect(b.customer.organizationId).toBe(orgB);
  });

  it("never returns another organization's customer for the same phone", async () => {
    const orgA = await makeOrg("c");
    const orgB = await makeOrg("d");

    const a = await createCustomerWithLoyalty({ prisma, organizationId: orgA, name: "عميل ج", phone: sharedPhone });
    customerIds.push(a.customer.id);

    // Looking up the same phone scoped to org B must NOT find org A's customer — it creates a fresh one.
    const b = await createCustomerWithLoyalty({ prisma, organizationId: orgB, name: "عميل د", phone: sharedPhone });
    customerIds.push(b.customer.id);

    expect(b.created).toBe(true);
    expect(b.customer.id).not.toBe(a.customer.id);

    // Re-lookup scoped to org A returns org A's customer (idempotent), not org B's.
    const again = await createCustomerWithLoyalty({ prisma, organizationId: orgA, name: "عميل ج مكرر", phone: sharedPhone });
    expect(again.created).toBe(false);
    expect(again.customer.id).toBe(a.customer.id);
  });

  it("blocks an [id] write scoped to the wrong organization", async () => {
    const orgA = await makeOrg("e");
    const orgB = await makeOrg("f");
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });

    const a = await createCustomerWithLoyalty({ prisma, organizationId: orgA, name: "عميل هـ", phone: sharedPhone });
    customerIds.push(a.customer.id);

    // Issuing a manager reward for org A's customer while scoped to org B must be rejected.
    await expect(
      createManagerReward(
        prisma,
        { customerId: a.customer.id, title: "هدية", discountAmount: 10 },
        { actorUserId: admin.id, actorType: "ADMIN", organizationId: orgB },
      ),
    ).rejects.toThrow("العميل غير موجود");

    // Same call scoped to org A succeeds.
    const reward = await createManagerReward(
      prisma,
      { customerId: a.customer.id, title: "هدية", discountAmount: 10 },
      { actorUserId: admin.id, actorType: "ADMIN", organizationId: orgA },
    );
    expect(reward.customerId).toBe(a.customer.id);
    await prisma.managerReward.deleteMany({ where: { customerId: a.customer.id } });
    await prisma.auditLog.deleteMany({ where: { entityType: "ManagerReward", entityId: reward.id } });
  });
});
