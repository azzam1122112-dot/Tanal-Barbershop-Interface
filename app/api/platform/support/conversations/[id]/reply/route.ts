import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { sendPlatformSupportReply } from "@/lib/email/platform-support";
import { toErrorResponse } from "@/lib/http/error-response";

const replySchema = z.object({ message: z.string().trim().min(2).max(10_000) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const parsed = replySchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "اكتب ردًا بين حرفين و10,000 حرف" }, { status: 400 });
  const { id } = await context.params;
  try {
    const message = await sendPlatformSupportReply(prisma, id, {
      message: parsed.data.message,
      adminId: auth.session.admin.id,
    });
    return NextResponse.json({ message, notice: "تم إرسال الرد للعميل" });
  } catch (error) {
    return toErrorResponse(error, "تعذر إرسال الرد");
  }
}
