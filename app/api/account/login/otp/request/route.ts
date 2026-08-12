import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { requestLoginOtp } from "@/lib/customers/account-auth";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerResendSchema } from "@/lib/customers/account-validation";
import { logger } from "@/lib/logger";

const NEUTRAL_MESSAGE = "إذا كان البريد مرتبطًا بحساب إكس مانس إكس فسيصلك رمز تسجيل الدخول.";

/** رد محايد واحد: لا يفرّق بين بريد مسجّل وغيره ولا بين موثّق وغير موثّق. */
export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerResendSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: NEUTRAL_MESSAGE });

  const limited = await consumeCustomerRateLimit("challengeSend", { ipAddress: meta.ipAddress, identifier: parsed.data.email });
  if (limited) return limited;

  try {
    await requestLoginOtp(prisma, parsed.data.email, meta);
  } catch (error) {
    logger.warn("customer_account.login_otp_request_failed", { error });
  }

  return NextResponse.json({ message: NEUTRAL_MESSAGE });
}
