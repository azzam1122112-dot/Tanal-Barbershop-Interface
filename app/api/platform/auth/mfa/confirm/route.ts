import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody, requirePlatformMfaSetupApi } from "@/lib/auth/http";
import { confirmPlatformMfaSetup } from "@/lib/auth/platform-mfa";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "أدخل رمزًا من 6 أرقام") });

export async function POST(request: Request) {
  const auth = await requirePlatformMfaSetupApi();
  if (auth.response) return auth.response;
  if (!auth.session || auth.session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    const recoveryCodes = await confirmPlatformMfaSetup(prisma, auth.session.admin.id, auth.session.id, parsed.data.code);
    return NextResponse.json({ recoveryCodes, redirectTo: "/platform" });
  } catch (error) {
    return toErrorResponse(error, "تعذر تفعيل المصادقة الثنائية");
  }
}
