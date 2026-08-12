import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { GENERIC_LOGIN_ERROR, loginCustomerAccount } from "@/lib/customers/account-auth";
import { setCustomerSessionCookie } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { customerLoginSchema } from "@/lib/customers/account-validation";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = customerLoginSchema.safeParse(await parseJsonBody(request));

  // حتى فشل التحقق الشكلي يردّ الرسالة العامة نفسها.
  if (!parsed.success) {
    return NextResponse.json({ message: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  const limited = await consumeCustomerRateLimit("login", { ipAddress: meta.ipAddress, identifier: parsed.data.identifier });
  if (limited) return limited;

  try {
    const result = await loginCustomerAccount(prisma, parsed.data, meta);

    if (result.outcome === "INVALID") {
      return NextResponse.json({ message: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    if (result.outcome === "EMAIL_UNVERIFIED") {
      // بيانات صحيحة لكن بلا توثيق: لا جلسة، ويُوجَّه إلى التفعيل.
      return NextResponse.json(
        {
          message: "فعّل بريدك أولًا لإتمام الدخول.",
          emailVerificationRequired: true,
          redirectTo: `/account/verify?email=${encodeURIComponent(result.email)}`,
        },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ redirectTo: "/account" });
    setCustomerSessionCookie(response, result.token);
    return response;
  } catch (error) {
    return toErrorResponse(error, GENERIC_LOGIN_ERROR);
  }
}
