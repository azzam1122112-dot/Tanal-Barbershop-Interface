import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { requestPasswordReset } from "@/lib/customers/account-auth";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerForgotPasswordSchema } from "@/lib/customers/account-validation";
import { logger } from "@/lib/logger";

const NEUTRAL_MESSAGE = "إن كان البريد مسجّلًا فسيصلك رمز إعادة التعيين.";

/**
 * طلب استعادة كلمة المرور — **رد واحد لكل الحالات**.
 *
 * `requestPasswordReset` نفسها لا ترمي عند غياب الحساب، وأي فشل داخلي (مزوّد
 * بريد غير مهيّأ مثلًا) يُبتلع هنا ويُسجَّل: لو ظهر فرق في الرد أو الحالة لَعرف
 * المجرِّب أيّ بريد له حساب.
 */
export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerForgotPasswordSchema.safeParse(await parseJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ message: NEUTRAL_MESSAGE });
  }

  const limited = await consumeCustomerRateLimit("challengeSend", { ipAddress: meta.ipAddress, identifier: parsed.data.email });
  if (limited) return limited;

  try {
    await requestPasswordReset(prisma, parsed.data.email, meta);
  } catch (error) {
    logger.warn("customer_account.password_reset_request_failed", { error });
  }

  return NextResponse.json({ message: NEUTRAL_MESSAGE });
}
