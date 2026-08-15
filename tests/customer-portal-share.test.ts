import { afterAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { buildCustomerPortalShareMessage } from "../lib/customers/portal-share";
import {
  hasLivePortalToken,
  hashPortalToken,
  issueCustomerPortalToken,
} from "../lib/customers/customer-portal";
import { toSaudiWhatsAppPhone } from "../lib/phone/saudi-phone";

const prisma = new PrismaClient();
const organizationIds: string[] = [];

/**
 * سياسة رابط البوابة من لوحة الإدارة.
 *
 * كان مسار `POST` يُسمّى «ensure» ويوثّق نفسه بـ«ينشئ الرمز عند أول طلب»، بينما
 * يُصدر رمزًا جديدًا في كل نداء — فزرٌّ نصُّه «نسخ الرابط مجددًا» كان يقتل الرابط
 * المفتوح على جهاز العميل، وبلا سجل تدقيق (التدقيق كان على `PUT` وحده).
 */
describe("dashboard portal link policy", () => {
  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.$disconnect();
  });

  async function makeCustomer() {
    const suffix = crypto.randomBytes(5).toString("hex");
    const organization = await prisma.organization.create({
      data: { name: "Portal policy", slug: `portal-policy-${suffix}` },
    });
    organizationIds.push(organization.id);
    const customer = await prisma.customer.create({
      data: {
        organizationId: organization.id,
        name: "عميل الرابط",
        phone: `9665${Date.now().toString().slice(-8)}`,
      },
    });
    return { organizationId: organization.id, customerId: customer.id };
  }

  it("لا رابط سارٍ قبل أول إصدار، ويصير ساريًا بعده", async () => {
    const { organizationId, customerId } = await makeCustomer();
    expect(await hasLivePortalToken(prisma, customerId, organizationId)).toBe(false);

    await issueCustomerPortalToken(prisma, customerId, organizationId);
    expect(await hasLivePortalToken(prisma, customerId, organizationId)).toBe(true);
  });

  it("كل إصدار يُبطل سابقه — لا يوجد إصدار بلا أثر", async () => {
    const { organizationId, customerId } = await makeCustomer();
    const first = await issueCustomerPortalToken(prisma, customerId, organizationId);
    const second = await issueCustomerPortalToken(prisma, customerId, organizationId);

    expect(second).not.toBe(first);
    const persisted = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(persisted.portalTokenHash).toBe(hashPortalToken(second));
    expect(persisted.portalTokenHash).not.toBe(hashPortalToken(first));
  });

  it("الرمز المنتهي لا يُعدّ ساريًا فيُصدر بديله بلا تأكيد", async () => {
    const { organizationId, customerId } = await makeCustomer();
    await issueCustomerPortalToken(prisma, customerId, organizationId);
    await prisma.customer.update({
      where: { id: customerId },
      data: { portalTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(await hasLivePortalToken(prisma, customerId, organizationId)).toBe(false);
  });

  it("النطاق مفروض: عميل مؤسسة أخرى لا يُقرأ ولا يُصدر له رمز", async () => {
    const mine = await makeCustomer();
    const other = await makeCustomer();

    expect(await hasLivePortalToken(prisma, other.customerId, mine.organizationId)).toBe(false);
    await expect(
      issueCustomerPortalToken(prisma, other.customerId, mine.organizationId),
    ).rejects.toThrow("العميل غير موجود");
  });
});

describe("customer portal link sharing", () => {
  it("builds a personal message with the exact private portal link", () => {
    const message = buildCustomerPortalShareMessage({
      customerName: "خالد",
      portalUrl: "https://example.com/my/private-token",
    });

    expect(message).toContain("مرحبًا خالد");
    expect(message).toContain("https://example.com/my/private-token");
    expect(message).toContain("احتفظ بهذا الرابط");
    expect(message).toContain("لا تشاركه مع أي شخص");
  });

  it("turns the verified local number into a WhatsApp destination", () => {
    expect(toSaudiWhatsAppPhone("0501234567")).toBe("966501234567");
  });
});
