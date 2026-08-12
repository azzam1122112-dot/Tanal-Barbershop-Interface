import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordManualPayment } from "../lib/billing/billing-service";
import { deliverSubscriptionInvoiceEmail } from "../lib/billing/subscription-invoice-delivery";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-invoice-email-${suffix}`;
const planId = `plan-invoice-email-${suffix}`;

describe("تسليم فاتورة الاشتراك", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.billingInvoice.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("يرسل PDF إلى البريد المسجل ويسجل حالة التسليم", async () => {
    await prisma.plan.create({
      data: {
        id: planId,
        name: `باقة فاتورة ${suffix}`,
        slug: `invoice-email-${suffix}`,
        description: "باقة اختبار تسليم الفاتورة",
        priceMonthly: 200,
        features: ["إدارة الحجوزات", "التقارير"],
        maxSalons: 2,
        maxBarbers: 10,
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "مؤسسة اختبار الفاتورة",
        slug: `invoice-email-org-${suffix}`,
        city: "الرياض",
        planId,
      },
    });
    await prisma.user.create({
      data: {
        organizationId,
        name: "مالك الفاتورة",
        email: `invoice-${suffix}@example.com`,
        phone: `05${Date.now().toString().slice(-8)}`,
        passwordHash: "test-hash",
        role: "OWNER",
      },
    });
    const invoice = await recordManualPayment(prisma, {
      organizationId,
      planId,
      amount: 200,
      periodMonths: 1,
      provider: "MANUAL_TRANSFER",
      reference: `EMAIL-${suffix}`,
      recordedByPlatformAdminId: "test-platform-admin",
      now: new Date("2026-08-12T08:30:00.000Z"),
    });

    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "resend-invoice-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchImpl);
    vi.stubEnv("RESEND_API_KEY", "re_test_invoice");
    vi.stubEnv("EMAIL_FROM", "إكس مانس إكس XMANSX <notifications@xmansx.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "support@xmansx.com");
    vi.stubEnv("EMAIL_PLATFORM_TAG", "xmansx");

    const result = await deliverSubscriptionInvoiceEmail(prisma, organizationId, invoice.id);

    expect(result).toMatchObject({ sent: true, providerId: "resend-invoice-1" });
    const [, request] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(request.body)) as {
      subject: string;
      attachments: Array<{ filename: string; content: string }>;
    };
    expect(payload.subject).toContain(invoice.invoiceNumber);
    expect(payload.attachments[0]?.filename).toContain(invoice.invoiceNumber);
    expect(Buffer.from(payload.attachments[0]!.content, "base64").subarray(0, 5).toString()).toBe("%PDF-");

    const stored = await prisma.billingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stored.invoiceEmailRecipient).toBe(`invoice-${suffix}@example.com`);
    expect(stored.invoiceEmailProviderId).toBe("resend-invoice-1");
    expect(stored.invoiceEmailSentAt).not.toBeNull();
    expect(stored.invoiceEmailAttempts).toBe(1);
    expect(stored.invoiceEmailLastError).toBeNull();
  });
});
