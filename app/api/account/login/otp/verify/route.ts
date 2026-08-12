import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { loginWithEmailOtp } from "@/lib/customers/account-auth";
import { setCustomerSessionCookie } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerVerifySchema } from "@/lib/customers/account-validation";
import { joinReturnPath } from "@/lib/customers/join-context";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerVerifySchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "الرمز غير صحيح أو انتهت صلاحيته." }, { status: 400 });

  const limited = await consumeCustomerRateLimit("challengeVerify", { ipAddress: meta.ipAddress, identifier: parsed.data.email });
  if (limited) return limited;

  try {
    const result = await loginWithEmailOtp(prisma, parsed.data, meta);
    if (result.outcome !== "SUCCESS") {
      return NextResponse.json({ message: "الرمز غير صحيح أو انتهت صلاحيته." }, { status: 400 });
    }

    const response = NextResponse.json({
      redirectTo: joinReturnPath(parsed.data.join, "/account/loyalty"),
      // الجهاز الجديد يُعرض عليه تفعيل الدخول السريع بعد نجاح الرمز.
      suggestPasskey: true,
    });
    setCustomerSessionCookie(response, result.token);
    return response;
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل الدخول");
  }
}
