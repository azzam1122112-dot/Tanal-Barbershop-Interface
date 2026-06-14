import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { whatsappTemplateCreateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { createWhatsAppTemplate, getWhatsAppTemplates } from "@/lib/whatsapp/whatsapp-service";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ templates: await getWhatsAppTemplates(prisma) });
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = whatsappTemplateCreateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات قالب واتساب غير صحيحة" }, { status: 400 });
  }

  const template = await createWhatsAppTemplate(prisma, parsed.data, {
    actorUserId: session.user.id,
    actorType: session.role,
    ...(await getRequestMeta()),
  });
  return NextResponse.json({ template }, { status: 201 });
}
