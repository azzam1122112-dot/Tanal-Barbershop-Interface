import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { setCustomerSessionCookie } from "@/lib/customers/account-http";
import { consumeCustomerRateLimit } from "@/lib/customers/account-rate-limit";
import { verifyPasskeyAuthentication } from "@/lib/customers/passkey-service";
import { joinReturnPath } from "@/lib/customers/join-context";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  response: z.record(z.string(), z.unknown()),
  join: z.string().trim().max(512).optional(),
});

export async function POST(request: Request) {
  const meta = await getRequestMeta();
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "تعذر الدخول السريع." }, { status: 401 });

  const limited = await consumeCustomerRateLimit("passkeyAuth", { ipAddress: meta.ipAddress, identifier: null });
  if (limited) return limited;

  try {
    const result = await verifyPasskeyAuthentication(prisma, parsed.data.response as never, meta);
    if (result.outcome === "INVALID") {
      return NextResponse.json({ message: "تعذر الدخول السريع. جرّب مرة أخرى أو استخدم بريدك." }, { status: 401 });
    }

    // نفس نظام الجلسة ونفس الكوكي: مفتاح المرور طريقة مصادقة لا نظام جلسات.
    const response = NextResponse.json({ redirectTo: joinReturnPath(parsed.data.join, "/account/loyalty") });
    setCustomerSessionCookie(response, result.token);
    return response;
  } catch (error) {
    return toErrorResponse(error, "تعذر الدخول السريع");
  }
}
