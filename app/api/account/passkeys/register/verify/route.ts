import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { requireCustomerApi } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { verifyPasskeyRegistration } from "@/lib/customers/passkey-service";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  response: z.record(z.string(), z.unknown()),
  name: z.string().trim().max(60).optional(),
});

/** التحقق في الخادم هو ما يُنشئ المفتاح — نجاح المتصفح وحده لا يكفي. */
export async function POST(request: Request) {
  const auth = await requireCustomerApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session) return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const meta = await getRequestMeta();
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "طلب غير صالح" }, { status: 400 });

  const limited = await consumeCustomerRateLimit("passkeyRegister", { ipAddress: meta.ipAddress, identifier: session.account.id });
  if (limited) return limited;

  try {
    const result = await verifyPasskeyRegistration(
      prisma,
      { accountId: session.account.id, response: parsed.data.response as never, name: parsed.data.name ?? null },
      meta,
    );
    return NextResponse.json({ passkeyId: result.passkeyId, message: "تم تفعيل الدخول السريع على هذا الجهاز." });
  } catch (error) {
    return toErrorResponse(error, "تعذر تفعيل الدخول السريع");
  }
}
