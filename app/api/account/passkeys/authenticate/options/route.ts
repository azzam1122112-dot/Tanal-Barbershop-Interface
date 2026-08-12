import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta } from "@/lib/auth/http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { buildPasskeyAuthenticationOptions } from "@/lib/customers/passkey-service";
import { toErrorResponse } from "@/lib/http/error-response";

/** خيارات الدخول — عامة وبلا بريد: المتصفح يعرض مفاتيح النطاق ويختار صاحبها. */
export async function POST() {
  const meta = await getRequestMeta();
  const limited = await consumeCustomerRateLimit("passkeyAuth", { ipAddress: meta.ipAddress, identifier: null });
  if (limited) return limited;

  try {
    return NextResponse.json(await buildPasskeyAuthenticationOptions(prisma));
  } catch (error) {
    return toErrorResponse(error, "تعذر بدء الدخول السريع");
  }
}
