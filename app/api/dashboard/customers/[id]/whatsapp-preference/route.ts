import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { customerWhatsappPreferenceSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { updateCustomerWhatsappPreference } from "@/lib/whatsapp/whatsapp-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = customerWhatsappPreferenceSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "تفضيل واتساب غير صحيح" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const customer = await updateCustomerWhatsappPreference(prisma, id, parsed.data.whatsappOptIn, {
      actorUserId: session.user.id,
      actorType: session.role,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "تعذر تعديل تفضيل واتساب" }, { status: 400 });
  }
}
