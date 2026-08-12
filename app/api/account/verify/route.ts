import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { verifyCustomerEmail } from "@/lib/customers/account-auth";
import { setCustomerSessionCookie } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerVerifySchema } from "@/lib/customers/account-validation";
import { joinReturnPath } from "@/lib/customers/join-context";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerVerifySchema.safeParse(await parseJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ message: "الرمز غير صحيح أو انتهت صلاحيته." }, { status: 400 });
  }

  const limited = await consumeCustomerRateLimit("challengeVerify", { ipAddress: meta.ipAddress, identifier: parsed.data.email });
  if (limited) return limited;

  try {
    // نجاح التحقق يفتح الجلسة مباشرة: صاحبه أثبت للتوّ ملكيته للبريد.
    const { token } = await verifyCustomerEmail(prisma, parsed.data, meta);
    // التوثيق نجح: نعرض تفعيل الدخول السريع قبل المتابعة، وبلا إجبار.
    // وجود سياق انضمام يقدّم إتمام الانضمام لأنه ما جاء العميل من أجله.
    const response = NextResponse.json({
      redirectTo: parsed.data.join ? joinReturnPath(parsed.data.join) : "/account/passkey-setup",
    });
    setCustomerSessionCookie(response, token);
    return response;
  } catch (error) {
    return toErrorResponse(error, "تعذر تفعيل الحساب");
  }
}
