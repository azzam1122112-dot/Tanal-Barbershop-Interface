import { describe, expect, it, vi } from "vitest";
import {
  EmailDeliveryError,
  getEmailConfiguration,
  isEmailConfigurationReady,
  sendTransactionalEmail,
} from "../lib/email/resend-email";
import { renderCustomerEmail } from "../lib/email/customer-email-templates";

const configuredEnv = {
  RESEND_API_KEY: "re_test_xmansx",
  EMAIL_FROM: "XMANSX | إكس مانس <notifications@xmansx.com>",
  EMAIL_REPLY_TO: "support@xmansx.com",
  EMAIL_PLATFORM_TAG: "xmansx",
  EMAIL_REQUIRED: "true",
};

describe("Resend customer email infrastructure", () => {
  it("keeps readiness optional locally and enforces it when required", () => {
    expect(getEmailConfiguration({
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      EMAIL_REPLY_TO: "",
      EMAIL_REQUIRED: "false",
    })).toMatchObject({ enabled: false, required: false, missing: ["RESEND_API_KEY", "EMAIL_FROM"] });
    expect(isEmailConfigurationReady({
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      EMAIL_REPLY_TO: "",
      EMAIL_REQUIRED: "false",
    })).toBe(true);
    expect(isEmailConfigurationReady({
      RESEND_API_KEY: "",
      EMAIL_FROM: "XMANSX <notifications@xmansx.com>",
      EMAIL_REPLY_TO: "",
      EMAIL_REQUIRED: "true",
    })).toBe(false);
  });

  it("sends through the fixed Resend endpoint with an idempotency key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const result = await sendTransactionalEmail({
      to: " CUSTOMER@Example.com ",
      subject: "تأكيد الموعد",
      html: "<p>تم</p>",
      text: "تم",
      idempotencyKey: "appointment-booked/appointment-1",
      tags: [{ name: "message_type", value: "appointment_booked" }],
      attachments: [{ filename: "invoice.pdf", content: Buffer.from("%PDF-test").toString("base64") }],
    }, { fetchImpl, env: configuredEnv });

    expect(result).toEqual({ id: "email-123" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_xmansx",
      "Idempotency-Key": "appointment-booked/appointment-1",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: configuredEnv.EMAIL_FROM,
      to: ["customer@example.com"],
      reply_to: configuredEnv.EMAIL_REPLY_TO,
      subject: "تأكيد الموعد",
      tags: [
        { name: "platform", value: "xmansx" },
        { name: "message_type", value: "appointment_booked" },
      ],
      attachments: [{ filename: "invoice.pdf", content: Buffer.from("%PDF-test").toString("base64") }],
    });
  });

  it("returns a safe typed error without exposing the provider response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "validation_error",
      message: "The xmansx.com domain is not verified",
    }), { status: 403, headers: { "Content-Type": "application/json" } }));

    await expect(sendTransactionalEmail({
      to: "customer@example.com",
      subject: "اختبار",
      html: "<p>test</p>",
      text: "test",
      idempotencyKey: "connection-test/1",
    }, { fetchImpl, env: configuredEnv })).rejects.toMatchObject({
      name: "EmailDeliveryError",
      message: "تعذر تسليم الرسالة إلى مزود البريد",
      status: 403,
      providerCode: "validation_error",
    } satisfies Partial<EmailDeliveryError>);
  });

  it("adds validated threading headers and a conversation-specific reply address", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-reply-1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await sendTransactionalEmail({
      to: "customer@example.com",
      subject: "Re: الدعم",
      html: "<p>تم</p>",
      text: "تم",
      replyTo: "support+conversation_123@xmansx.com",
      threading: { inReplyTo: "<customer-message@example.com>" },
      idempotencyKey: "support-reply/1",
    }, { fetchImpl, env: configuredEnv });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      reply_to: "support+conversation_123@xmansx.com",
      headers: {
        "In-Reply-To": "<customer-message@example.com>",
        References: "<customer-message@example.com>",
      },
    });
  });

  it("escapes customer data and only permits HTTPS calls to action", () => {
    const rendered = renderCustomerEmail({
      preheader: "أهلًا <عميل>",
      title: "موعد <script>alert(1)</script>",
      body: ["فرع & صالون"],
      cta: { label: "افتح البطاقة", url: "https://www.xmansx.com/my/token" },
    });

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("فرع &amp; صالون");
    expect(() => renderCustomerEmail({
      preheader: "test",
      title: "test",
      body: ["test"],
      cta: { label: "غير آمن", url: "http://example.com" },
    })).toThrow("HTTPS");
  });
});
