import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { resetCustomerPassword } from "@/lib/customers/account-auth";
import { clearCustomerSessionCookie } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerResetPasswordSchema } from "@/lib/customers/account-validation";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerResetPasswordSchema.safeParse(await parseJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  }

  const limited = await consumeCustomerRateLimit("challengeVerify", { ipAddress: meta.ipAddress, identifier: parsed.data.email });
  if (limited) return limited;

  try {
    await resetCustomerPassword(prisma, parsed.data, meta);
    // كل الجلسات أُلغيت — بما فيها جلسة هذا المتصفح إن وُجدت. لا دخول تلقائي:
    // من غيّر كلمته يدخل بها فيثبت أنه يحفظها.
    const response = NextResponse.json({
      message: "تم تعيين كلمة المرور. سجّل الدخول بها الآن.",
      redirectTo: "/account/login",
    });
    clearCustomerSessionCookie(response);
    return response;
  } catch (error) {
    return toErrorResponse(error, "تعذر تعيين كلمة المرور");
  }
}
