import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformApi, parseJsonBody } from "@/lib/auth/http";
import { adminPasswordSchema } from "@/lib/auth/password";
import { changePlatformAdminPassword } from "@/lib/platform/platform-admin-service";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: adminPasswordSchema,
});

export async function POST(request: Request) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  }

  try {
    await changePlatformAdminPassword(prisma, session.admin.id, parsed.data.currentPassword, parsed.data.newPassword);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "تعذر تغيير كلمة المرور");
  }
}
