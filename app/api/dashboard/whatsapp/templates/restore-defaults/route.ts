import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { seedDefaultWhatsAppTemplates } from "@/lib/whatsapp/default-templates";
import { getWhatsAppTemplates } from "@/lib/whatsapp/whatsapp-service";

// يضيف القوالب الاحترافية الناقصة للمؤسسة دون المساس بالقوالب المعدّلة الموجودة.
export async function POST() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const created = await seedDefaultWhatsAppTemplates(prisma, session.organizationId);
  const templates = await getWhatsAppTemplates(prisma, session.organizationId);
  return NextResponse.json({ created, templates });
}
