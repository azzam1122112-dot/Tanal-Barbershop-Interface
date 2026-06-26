import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformApi, parseJsonBody } from "@/lib/auth/http";
import { adminPasswordSchema } from "@/lib/auth/password";
import { createPlatformAdmin, listPlatformAdmins } from "@/lib/platform/platform-admin-service";
import { toErrorResponse } from "@/lib/http/error-response";

const createSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب"),
  email: z.string().trim().email("البريد الإلكتروني غير صحيح").transform((v) => v.toLowerCase()),
  password: adminPasswordSchema,
});

export async function GET() {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ admins: await listPlatformAdmins(prisma) });
}

export async function POST(request: Request) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;

  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  }

  try {
    const admin = await createPlatformAdmin(prisma, parsed.data);
    return NextResponse.json({ admin }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إنشاء المدير");
  }
}
