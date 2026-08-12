import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { processResendReceivedEmail } from "@/lib/email/platform-support";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const receivedEventSchema = z.object({
  type: z.literal("email.received"),
  created_at: z.string().min(1),
  data: z.object({
    email_id: z.string().min(1).max(200),
    created_at: z.string().min(1),
    from: z.string().min(3).max(500),
    to: z.array(z.string().min(3).max(500)).min(1).max(100),
    subject: z.string().max(998).default("بدون عنوان"),
    message_id: z.string().max(998).nullish(),
  }),
});

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    logger.error("email.webhook_missing_secret");
    return NextResponse.json({ message: "Webhook غير مهيأ" }, { status: 503 });
  }

  const eventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!eventId || !timestamp || !signature) {
    return NextResponse.json({ message: "توقيع Webhook مفقود" }, { status: 400 });
  }

  const payload = await request.text();
  let verified: unknown;
  try {
    verified = new Webhook(secret).verify(payload, {
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    });
  } catch {
    logger.warn("email.webhook_invalid_signature", { eventId });
    return NextResponse.json({ message: "توقيع Webhook غير صالح" }, { status: 400 });
  }

  const decoded = JSON.parse(payload) as { type?: string };
  if (decoded.type !== "email.received") return NextResponse.json({ received: true, ignored: true });

  const parsed = receivedEventSchema.safeParse(verified);
  if (!parsed.success) {
    logger.warn("email.webhook_invalid_payload", { eventId });
    return NextResponse.json({ message: "بيانات Webhook غير صالحة" }, { status: 400 });
  }

  try {
    const result = await processResendReceivedEmail(prisma, {
      eventId,
      emailId: parsed.data.data.email_id,
      createdAt: parsed.data.data.created_at || parsed.data.created_at,
      from: parsed.data.data.from,
      to: parsed.data.data.to,
      subject: parsed.data.data.subject,
      messageId: parsed.data.data.message_id,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    logger.error("email.webhook_processing_failed", { error, eventId });
    return NextResponse.json({ message: "تعذر معالجة البريد الوارد" }, { status: 502 });
  }
}
