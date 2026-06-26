import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { whatsappTemplateUpdateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { updateWhatsAppTemplate } from "@/lib/whatsapp/whatsapp-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = whatsappTemplateUpdateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات تعديل قالب واتساب غير صحيحة" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const template = await updateWhatsAppTemplate(prisma, id, parsed.data, {
      actorUserId: session.user.id,
      actorType: session.role,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ template });
  } catch (error) {
    return toErrorResponse(error, "تعذر تعديل قالب واتساب");
  }
}
