import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { sendVerificationChallenge } from "@/lib/customers/account-auth";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerResendSchema } from "@/lib/customers/account-validation";
import { normalizeEmail } from "@/lib/email/normalize-email";
import { logger } from "@/lib/logger";

const NEUTRAL_MESSAGE = "إن كان الحساب بحاجة إلى تفعيل فقد أرسلنا رمزًا جديدًا إلى بريده.";

/**
 * إعادة إرسال رمز التفعيل — **رد محايد دائمًا**.
 *
 * مسار عام يقبل بريدًا مجردًا، فلو فرّق بين «أُرسل» و«لا حساب» لصار أداة استكشاف
 * لمن له حساب. الفشل الداخلي (بريد موثّق أصلًا، حساب معطّل، مزوّد بريد غير مهيّأ)
 * يُسجَّل ولا يُعرض.
 */
export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerResendSchema.safeParse(await parseJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ message: NEUTRAL_MESSAGE });
  }

  const limited = await consumeCustomerRateLimit("challengeSend", { ipAddress: meta.ipAddress, identifier: parsed.data.email });
  if (limited) return limited;

  try {
    const emailNormalized = normalizeEmail(parsed.data.email);
    const account = await prisma.customerAccount.findUnique({ where: { emailNormalized }, select: { id: true } });
    if (account) {
      await sendVerificationChallenge(prisma, account.id, meta);
    }
  } catch (error) {
    logger.warn("customer_account.resend_verification_failed", { error });
  }

  return NextResponse.json({ message: NEUTRAL_MESSAGE });
}
