import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { renderEmailConnectionTest } from "@/lib/email/customer-email-templates";
import { getEmailConfiguration, sendTransactionalEmail } from "@/lib/email/resend-email";
import { emailInputSchema } from "@/lib/email/normalize-email";
import { toErrorResponse } from "@/lib/http/error-response";

const testEmailSchema = z.object({ email: emailInputSchema });

export async function GET() {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const config = getEmailConfiguration();
  return NextResponse.json({
    enabled: config.enabled,
    required: config.required,
    from: config.from,
    replyTo: config.replyTo,
    missing: config.missing,
  });
}

export async function POST(request: Request) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;

  const parsed = testEmailSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "البريد الإلكتروني غير صالح" }, { status: 400 });
  }

  try {
    const template = renderEmailConnectionTest();
    const result = await sendTransactionalEmail({
      to: parsed.data.email,
      subject: "اختبار ربط البريد · إكس مانس إكس XMANSX",
      ...template,
      idempotencyKey: `platform-email-test/${crypto.randomUUID()}`,
      tags: [{ name: "message_type", value: "connection_test" }],
    });
    return NextResponse.json({ id: result.id, message: "قَبِل مزود البريد الرسالة" });
  } catch (error) {
    return toErrorResponse(error, "تعذر إرسال رسالة الاختبار");
  }
}
