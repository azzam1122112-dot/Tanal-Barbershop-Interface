import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta } from "@/lib/auth/http";
import { requireCustomerApi } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { buildPasskeyRegistrationOptions } from "@/lib/customers/passkey-service";
import { toErrorResponse } from "@/lib/http/error-response";

/** خيارات تفعيل مفتاح مرور — تتطلب جلسة عميل صالحة وبريدًا موثّقًا. */
export async function POST() {
  const auth = await requireCustomerApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session) return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const meta = await getRequestMeta();
  const limited = await consumeCustomerRateLimit("passkeyRegister", { ipAddress: meta.ipAddress, identifier: session.account.id });
  if (limited) return limited;

  try {
    return NextResponse.json(await buildPasskeyRegistrationOptions(prisma, session.account.id));
  } catch (error) {
    return toErrorResponse(error, "تعذر بدء تفعيل الدخول السريع");
  }
}
