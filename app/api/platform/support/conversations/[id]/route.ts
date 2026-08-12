import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { updateSupportConversation } from "@/lib/email/platform-support";
import { toErrorResponse } from "@/lib/http/error-response";

const updateSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "SPAM"]).optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(),
  assignedAdminId: z.string().min(1).max(100).nullable().optional(),
  markRead: z.boolean().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), "لا يوجد تعديل");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "بيانات التحديث غير صالحة" }, { status: 400 });
  const { id } = await context.params;
  try {
    const conversation = await updateSupportConversation(prisma, id, parsed.data);
    return NextResponse.json({ conversation });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث المحادثة");
  }
}
