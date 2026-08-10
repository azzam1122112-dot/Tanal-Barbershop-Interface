import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformMfaSetupApi } from "@/lib/auth/http";
import { beginPlatformMfaSetup } from "@/lib/auth/platform-mfa";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST() {
  const auth = await requirePlatformMfaSetupApi();
  if (auth.response) return auth.response;
  if (!auth.session || auth.session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  try {
    return NextResponse.json(await beginPlatformMfaSetup(prisma, auth.session.admin.id));
  } catch (error) {
    return toErrorResponse(error, "تعذر بدء إعداد المصادقة الثنائية");
  }
}
