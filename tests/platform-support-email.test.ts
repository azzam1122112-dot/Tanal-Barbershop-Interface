import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  getSupportConfiguration,
  isInboundSupportReady,
  isSupportRecipient,
  normalizeSupportSubject,
  parseMailbox,
  processResendReceivedEmail,
} from "../lib/email/platform-support";

const supportEnv = {
  RESEND_INBOUND_API_KEY: "re_inbound_test",
  RESEND_WEBHOOK_SECRET: "whsec_test",
  SUPPORT_EMAIL_ADDRESS: "support@xmansx.com",
  INBOUND_EMAIL_REQUIRED: "true",
};

describe("Platform support email", () => {
  it("requires all inbound secrets only when production enforcement is enabled", () => {
    expect(getSupportConfiguration({ INBOUND_EMAIL_REQUIRED: "false" })).toMatchObject({
      enabled: false,
      required: false,
      missing: ["RESEND_INBOUND_API_KEY", "RESEND_WEBHOOK_SECRET", "SUPPORT_EMAIL_ADDRESS"],
    });
    expect(isInboundSupportReady({ INBOUND_EMAIL_REQUIRED: "false" })).toBe(true);
    expect(isInboundSupportReady({ INBOUND_EMAIL_REQUIRED: "true" })).toBe(false);
    expect(isInboundSupportReady(supportEnv)).toBe(true);
  });

  it("recognizes the official support mailbox and conversation plus-addresses", () => {
    expect(isSupportRecipient("support@xmansx.com", "support@xmansx.com")).toBe(true);
    expect(isSupportRecipient("support+cm12345678@xmansx.com", "support@xmansx.com")).toBe(true);
    expect(isSupportRecipient("billing@xmansx.com", "support@xmansx.com")).toBe(false);
    expect(isSupportRecipient("support@example.com", "support@xmansx.com")).toBe(false);
  });

  it("normalizes reply subjects and parses a display mailbox safely", () => {
    expect(normalizeSupportSubject(" Re: FWD:  مشكلة في الاشتراك ")).toBe("مشكلة في الاشتراك");
    expect(parseMailbox("عميل XMANSX <CUSTOMER@Example.com>")).toEqual({
      email: "customer@example.com",
      name: "عميل XMANSX",
    });
  });

  it("stores a verified inbound message as plain text and updates unread state", async () => {
    const messageCreate = vi.fn().mockResolvedValue({ id: "message-1" });
    const conversationUpdate = vi.fn().mockResolvedValue({ id: "conversation-1" });
    const tx = {
      platformSupportConversation: {
        create: vi.fn().mockResolvedValue({ id: "conversation-1" }),
        update: conversationUpdate,
      },
      platformSupportMessage: { create: messageCreate },
    };
    const db = {
      platformSupportMessage: { findFirst: vi.fn().mockResolvedValue(null) },
      platformSupportConversation: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaClient;
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "email-in-1",
      to: ["support@xmansx.com"],
      from: "customer@example.com",
      created_at: "2026-08-12T03:00:00.000Z",
      subject: "مشكلة في الحجز",
      html: "<p>مرحبًا</p><script>alert(1)</script><p>أحتاج مساعدة</p>",
      text: null,
      headers: { from: "عميل تجريبي <customer@example.com>" },
      cc: [],
      message_id: "<customer-message@example.com>",
      attachments: [{
        id: "attachment-1",
        filename: "../invoice.pdf",
        content_type: "application/pdf",
        content_disposition: "attachment",
        content_id: null,
        size: 2048,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await processResendReceivedEmail(db, {
      eventId: "evt-1",
      emailId: "email-in-1",
      createdAt: "2026-08-12T03:00:00.000Z",
      from: "customer@example.com",
      to: ["support@xmansx.com"],
      subject: "مشكلة في الحجز",
    }, { env: supportEnv, fetchImpl });

    expect(result).toMatchObject({ accepted: true, duplicate: false, conversationId: "conversation-1" });
    const stored = messageCreate.mock.calls[0][0].data;
    expect(stored.bodyText).toContain("مرحبًا");
    expect(stored.bodyText).toContain("أحتاج مساعدة");
    expect(stored.bodyText).not.toContain("alert(1)");
    expect(stored.attachments.create[0]).toMatchObject({ filename: ".._invoice.pdf", size: 2048 });
    expect(conversationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ unreadCount: { increment: 1 }, status: "OPEN" }),
    }));
  });

  it("treats repeated webhook deliveries as idempotent without another provider call", async () => {
    const db = {
      platformSupportMessage: {
        findFirst: vi.fn().mockResolvedValue({ id: "message-1", conversationId: "conversation-1" }),
      },
    } as unknown as PrismaClient;
    const fetchImpl = vi.fn();
    const result = await processResendReceivedEmail(db, {
      eventId: "evt-1",
      emailId: "email-in-1",
      createdAt: "2026-08-12T03:00:00.000Z",
      from: "customer@example.com",
      to: ["support@xmansx.com"],
      subject: "اختبار",
    }, { env: supportEnv, fetchImpl });
    expect(result).toEqual({ accepted: true, duplicate: true, conversationId: "conversation-1" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
