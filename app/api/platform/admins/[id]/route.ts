import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePlatformApi, parseJsonBody } from "@/lib/auth/http";
import { setPlatformAdminActive } from "@/lib/platform/platform-admin-service";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({ isActive: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "بيانات غير صحيحة" }, { status: 400 });

  try {
    const admin = await setPlatformAdminActive(prisma, id, parsed.data.isActive, session.admin.id);
    return NextResponse.json({ admin });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث المدير");
  }
}
