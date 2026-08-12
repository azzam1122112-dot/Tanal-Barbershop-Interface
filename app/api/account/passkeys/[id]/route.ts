import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta } from "@/lib/auth/http";
import { requireCustomerApi } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { revokePasskey } from "@/lib/customers/passkey-service";
import { toErrorResponse } from "@/lib/http/error-response";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomerApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session) return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const meta = await getRequestMeta();
  const limited = await consumeCustomerRateLimit("passkeyRegister", { ipAddress: meta.ipAddress, identifier: session.account.id });
  if (limited) return limited;

  try {
    const { id } = await context.params;
    await revokePasskey(prisma, { accountId: session.account.id, passkeyId: id }, meta);
    return NextResponse.json({ message: "أُلغيت طريقة الدخول." });
  } catch (error) {
    return toErrorResponse(error, "تعذر إلغاء طريقة الدخول");
  }
}
