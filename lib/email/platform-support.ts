import {
  PlatformSupportPriority,
  PlatformSupportStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/email/normalize-email";
import { renderPlatformSupportReply } from "@/lib/email/customer-email-templates";
import { sendTransactionalEmail } from "@/lib/email/resend-email";

const RESEND_RECEIVING_URL = "https://api.resend.com/emails/receiving";
const MAX_STORED_BODY_LENGTH = 200_000;
const ACTIVE_THREAD_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

type SupportEnvironment = {
  [key: string]: string | undefined;
  RESEND_INBOUND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  SUPPORT_EMAIL_ADDRESS?: string;
  INBOUND_EMAIL_REQUIRED?: string;
};

export type ResendReceivedEvent = {
  eventId: string;
  emailId: string;
  createdAt: string;
  from: string;
  to: string[];
  subject: string;
  messageId?: string | null;
};

type ReceivedEmail = {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  cc: string[];
  message_id: string | null;
  attachments: Array<{
    id: string;
    filename: string;
    content_type: string;
    content_disposition: string | null;
    content_id: string | null;
    size?: number | null;
  }>;
};

export function getSupportConfiguration(env: SupportEnvironment = process.env) {
  const inboundApiKey = env.RESEND_INBOUND_API_KEY?.trim() ?? "";
  const webhookSecret = env.RESEND_WEBHOOK_SECRET?.trim() ?? "";
  const supportAddress = env.SUPPORT_EMAIL_ADDRESS?.trim().toLowerCase() ?? "";
  const missing = [
    ...(inboundApiKey ? [] : ["RESEND_INBOUND_API_KEY"]),
    ...(webhookSecret ? [] : ["RESEND_WEBHOOK_SECRET"]),
    ...(supportAddress ? [] : ["SUPPORT_EMAIL_ADDRESS"]),
  ];
  return {
    enabled: missing.length === 0,
    required: env.INBOUND_EMAIL_REQUIRED === "true",
    inboundApiKey,
    webhookSecret,
    supportAddress,
    missing,
  };
}

export function isInboundSupportReady(env: SupportEnvironment = process.env) {
  const config = getSupportConfiguration(env);
  return !config.required || config.enabled;
}

export function normalizeSupportSubject(subject: string) {
  return subject
    .trim()
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US")
    .slice(0, 300) || "بدون عنوان";
}

export function parseMailbox(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = normalizeEmail(match?.[2] ?? trimmed);
  const name = match?.[1]?.trim().replace(/^['"]|['"]$/g, "") || null;
  return { email, name };
}

export function isSupportRecipient(recipient: string, supportAddress: string) {
  const normalizedRecipient = normalizeEmail(recipient);
  const normalizedSupport = normalizeEmail(supportAddress);
  const [supportLocal, supportDomain] = normalizedSupport.split("@");
  const [recipientLocal, recipientDomain] = normalizedRecipient.split("@");
  return recipientDomain === supportDomain && (recipientLocal === supportLocal || recipientLocal.startsWith(`${supportLocal}+`));
}

export async function processResendReceivedEmail(
  db: PrismaClient,
  event: ResendReceivedEvent,
  options: { env?: SupportEnvironment; fetchImpl?: typeof fetch } = {},
) {
  const config = getSupportConfiguration(options.env);
  if (!config.inboundApiKey || !config.supportAddress) {
    throw new Error("Inbound email processing is not configured");
  }

  const duplicate = await db.platformSupportMessage.findFirst({
    where: { OR: [{ providerEventId: event.eventId }, { providerEmailId: event.emailId }] },
    select: { id: true, conversationId: true },
  });
  if (duplicate) return { accepted: true, duplicate: true, conversationId: duplicate.conversationId };

  const email = await retrieveReceivedEmail(event.emailId, config.inboundApiKey, options.fetchImpl ?? fetch);
  const supportRecipient = email.to.find((recipient) => isSupportRecipient(recipient, config.supportAddress));
  if (!supportRecipient) return { accepted: false, ignored: true, reason: "recipient" } as const;

  const senderHeader = headerValue(email.headers, "from") ?? email.from;
  const participant = parseMailbox(senderHeader);
  const subject = cleanHeaderText(email.subject || event.subject || "بدون عنوان", 500);
  const subjectKey = normalizeSupportSubject(subject);
  const inReplyTo = cleanMessageId(headerValue(email.headers, "in-reply-to"));
  const references = parseReferences(headerValue(email.headers, "references"));
  const recipientConversationId = conversationIdFromRecipient(supportRecipient, config.supportAddress);
  const occurredAt = validDate(email.created_at) ?? validDate(event.createdAt) ?? new Date();
  const bodyText = receivedBodyToText(email.text, email.html);

  const existingConversation = await findConversation(db, {
    recipientConversationId,
    participantEmail: participant.email,
    subjectKey,
    inReplyTo,
    occurredAt,
  });

  return db.$transaction(async (tx) => {
    const conversation = existingConversation ?? await tx.platformSupportConversation.create({
      data: {
        participantEmail: participant.email,
        participantName: participant.name,
        subject,
        subjectKey,
        lastMessageAt: occurredAt,
        unreadCount: 0,
      },
      select: { id: true },
    });

    await tx.platformSupportMessage.create({
      data: {
        conversationId: conversation.id,
        providerEmailId: email.id,
        providerEventId: event.eventId,
        direction: "INBOUND",
        fromAddress: participant.email,
        toAddresses: email.to.map((address) => address.toLowerCase()),
        ccAddresses: (email.cc ?? []).map((address) => address.toLowerCase()),
        subject,
        bodyText,
        messageId: cleanMessageId(email.message_id ?? event.messageId),
        inReplyTo,
        references,
        createdAt: occurredAt,
        attachments: {
          create: email.attachments.slice(0, 30).map((attachment) => ({
            providerAttachmentId: attachment.id,
            filename: cleanFilename(attachment.filename),
            contentType: cleanHeaderText(attachment.content_type || "application/octet-stream", 200),
            contentDisposition: attachment.content_disposition,
            contentId: attachment.content_id,
            size: Number.isSafeInteger(attachment.size) && Number(attachment.size) >= 0 ? Number(attachment.size) : null,
          })),
        },
      },
    });

    await tx.platformSupportConversation.update({
      where: { id: conversation.id },
      data: {
        participantName: participant.name ?? undefined,
        subject,
        subjectKey,
        lastMessageAt: occurredAt,
        unreadCount: { increment: 1 },
        status: "OPEN",
      },
    });
    return { accepted: true, duplicate: false, conversationId: conversation.id };
  });
}

export async function getPlatformSupportInbox(db: PrismaClient) {
  const [conversations, openCount, pendingCount, resolvedCount, unread, activeAdmins] = await Promise.all([
    db.platformSupportConversation.findMany({
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: 100,
      include: {
        assignedAdmin: { select: { id: true, name: true } },
        messages: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 100,
          include: {
            sentByAdmin: { select: { id: true, name: true } },
            attachments: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    }),
    db.platformSupportConversation.count({ where: { status: "OPEN" } }),
    db.platformSupportConversation.count({ where: { status: "PENDING" } }),
    db.platformSupportConversation.count({ where: { status: "RESOLVED" } }),
    db.platformSupportConversation.aggregate({ _sum: { unreadCount: true } }),
    db.platformAdmin.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return {
    stats: { open: openCount, pending: pendingCount, resolved: resolvedCount, unread: unread._sum.unreadCount ?? 0 },
    admins: activeAdmins,
    conversations: conversations.map((conversation) => ({
      ...conversation,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
        attachments: message.attachments.map((attachment) => ({ ...attachment, createdAt: attachment.createdAt.toISOString() })),
      })),
    })),
  };
}

export async function updateSupportConversation(
  db: PrismaClient,
  conversationId: string,
  input: { status?: PlatformSupportStatus; priority?: PlatformSupportPriority; assignedAdminId?: string | null; markRead?: boolean },
) {
  if (input.assignedAdminId) {
    const admin = await db.platformAdmin.findFirst({ where: { id: input.assignedAdminId, isActive: true }, select: { id: true } });
    if (!admin) throw new BusinessError("مدير المنصة المحدد غير متاح", 404);
  }
  try {
    return await db.platformSupportConversation.update({
      where: { id: conversationId },
      data: {
        status: input.status,
        priority: input.priority,
        assignedAdminId: input.assignedAdminId,
        ...(input.markRead ? { unreadCount: 0 } : {}),
      },
      select: { id: true, status: true, priority: true, unreadCount: true, assignedAdminId: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new BusinessError("المحادثة غير موجودة", 404);
    }
    throw error;
  }
}

export async function sendPlatformSupportReply(
  db: PrismaClient,
  conversationId: string,
  input: { message: string; adminId: string },
) {
  const message = input.message.trim();
  if (message.length < 2 || message.length > 10_000) throw new BusinessError("نص الرد يجب أن يكون بين حرفين و10,000 حرف");

  const conversation = await db.platformSupportConversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 },
    },
  });
  if (!conversation) throw new BusinessError("المحادثة غير موجودة", 404);
  if (conversation.status === "SPAM") throw new BusinessError("لا يمكن الرد على محادثة مصنفة كرسائل مزعجة");

  const latestInbound = conversation.messages.find((item) => item.direction === "INBOUND" && item.messageId);
  const subject = conversation.subject.toLowerCase().startsWith("re:") ? conversation.subject : `Re: ${conversation.subject}`;
  const rendered = renderPlatformSupportReply({ customerName: conversation.participantName, message });
  const supportAddress = getSupportConfiguration().supportAddress;
  if (!supportAddress) throw new BusinessError("عنوان بريد الدعم غير مضبوط على الخادم", 503);
  const replyAddress = withConversationToken(supportAddress, conversation.id);
  const references = conversation.messages.flatMap((item) => item.messageId ? [item.messageId] : []).slice(-19);

  const result = await sendTransactionalEmail({
    to: conversation.participantEmail,
    subject,
    ...rendered,
    replyTo: replyAddress,
    ...(latestInbound?.messageId ? { threading: { inReplyTo: latestInbound.messageId, references } } : {}),
    idempotencyKey: `platform-support/${conversation.id}/${crypto.randomUUID()}`,
    tags: [
      { name: "message_type", value: "support_reply" },
      { name: "conversation", value: conversation.id },
    ],
  });

  const stored = await db.$transaction(async (tx) => {
    const outbound = await tx.platformSupportMessage.create({
      data: {
        conversationId: conversation.id,
        providerEmailId: result.id,
        direction: "OUTBOUND",
        fromAddress: replyAddress,
        toAddresses: [conversation.participantEmail],
        subject,
        bodyText: message,
        inReplyTo: latestInbound?.messageId ?? null,
        references,
        sentByAdminId: input.adminId,
      },
      select: { id: true, providerEmailId: true, createdAt: true },
    });
    await tx.platformSupportConversation.update({
      where: { id: conversation.id },
      data: { status: "PENDING", unreadCount: 0, lastMessageAt: outbound.createdAt, assignedAdminId: input.adminId },
    });
    return outbound;
  });
  return { ...stored, createdAt: stored.createdAt.toISOString() };
}

export async function getSupportAttachmentDownload(
  db: PrismaClient,
  messageId: string,
  attachmentId: string,
  options: { env?: SupportEnvironment; fetchImpl?: typeof fetch } = {},
) {
  const attachment = await db.platformSupportAttachment.findFirst({
    where: { id: attachmentId, messageId, message: { direction: "INBOUND", providerEmailId: { not: null } } },
    include: { message: { select: { providerEmailId: true } } },
  });
  if (!attachment?.message.providerEmailId) throw new BusinessError("المرفق غير موجود", 404);
  const config = getSupportConfiguration(options.env);
  if (!config.inboundApiKey) throw new BusinessError("خدمة مرفقات البريد غير مهيأة", 503);
  const response = await (options.fetchImpl ?? fetch)(
    `${RESEND_RECEIVING_URL}/${encodeURIComponent(attachment.message.providerEmailId)}/attachments/${encodeURIComponent(attachment.providerAttachmentId)}`,
    { headers: { Authorization: `Bearer ${config.inboundApiKey}` }, signal: AbortSignal.timeout(10_000) },
  );
  const payload = await response.json().catch(() => null) as { download_url?: string } | null;
  if (!response.ok || !payload?.download_url) throw new BusinessError("تعذر تجهيز رابط المرفق", 502);
  const url = new URL(payload.download_url);
  if (url.protocol !== "https:" || !(url.hostname === "resend.com" || url.hostname.endsWith(".resend.com"))) {
    throw new Error("Unexpected attachment host");
  }
  return { attachment, downloadUrl: url.toString() };
}

async function retrieveReceivedEmail(emailId: string, apiKey: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`${RESEND_RECEIVING_URL}/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as ReceivedEmail | { message?: string } | null;
  if (!response.ok || !payload || !("id" in payload)) throw new Error("Could not retrieve received email from Resend");
  return payload;
}

async function findConversation(
  db: PrismaClient,
  input: {
    recipientConversationId: string | null;
    participantEmail: string;
    subjectKey: string;
    inReplyTo: string | null;
    occurredAt: Date;
  },
) {
  if (input.recipientConversationId) {
    const byRecipient = await db.platformSupportConversation.findUnique({
      where: { id: input.recipientConversationId },
      select: { id: true },
    });
    if (byRecipient) return byRecipient;
  }
  if (input.inReplyTo) {
    const byThread = await db.platformSupportMessage.findFirst({
      where: { messageId: input.inReplyTo },
      select: { conversation: { select: { id: true } } },
    });
    if (byThread) return byThread.conversation;
  }
  return db.platformSupportConversation.findFirst({
    where: {
      participantEmail: input.participantEmail,
      subjectKey: input.subjectKey,
      status: { in: ["OPEN", "PENDING"] },
      lastMessageAt: { gte: new Date(input.occurredAt.getTime() - ACTIVE_THREAD_WINDOW_MS) },
    },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
}

function receivedBodyToText(text: string | null, html: string | null) {
  const value = text?.trim() || htmlToPlainText(html ?? "") || "رسالة بدون محتوى نصي.";
  return value.slice(0, MAX_STORED_BODY_LENGTH);
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<\s*(br|\/p|\/div|\/li)\b[^>]*>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function headerValue(headers: Record<string, string>, name: string) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function cleanMessageId(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && /^<[^<>\r\n]{1,990}>$/.test(trimmed) ? trimmed : null;
}

function parseReferences(value: string | null) {
  return (value?.match(/<[^<>\r\n]{1,990}>/g) ?? []).slice(-20);
}

function conversationIdFromRecipient(recipient: string, supportAddress: string) {
  const [recipientLocal] = normalizeEmail(recipient).split("@");
  const [supportLocal] = normalizeEmail(supportAddress).split("@");
  if (!recipientLocal.startsWith(`${supportLocal}+`)) return null;
  const token = recipientLocal.slice(supportLocal.length + 1);
  return /^[a-z0-9_-]{8,64}$/i.test(token) ? token : null;
}

function withConversationToken(address: string, conversationId: string) {
  const [local, domain] = normalizeEmail(address).split("@");
  return `${local}+${conversationId}@${domain}`;
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanHeaderText(value: string, max: number) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function cleanFilename(value: string) {
  return value.replace(/[\\/\0\r\n]/g, "_").trim().slice(0, 255) || "attachment";
}
