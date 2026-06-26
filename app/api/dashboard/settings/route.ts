import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { systemSettingsUpdateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { toSafeSystemSettings, updateSystemSettings } from "@/lib/settings/system-settings";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const settings = session.salonId
    ? await prisma.systemSettings.findFirst({ where: { salonId: session.salonId } })
    : await prisma.systemSettings.findFirst({ where: { organizationId: session.organizationId } });
  if (!settings) return NextResponse.json({ message: "إعدادات النظام غير موجودة" }, { status: 404 });
  return NextResponse.json({ settings: toSafeSystemSettings(settings) });
}

export async function PATCH(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = systemSettingsUpdateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الإعدادات غير صحيحة" }, { status: 400 });
  }

  try {
    const settings = await updateSystemSettings(prisma, parsed.data, {
      actorUserId: session.user.id,
      actorType: session.role,
      salonId: session.salonId,
      organizationId: session.organizationId,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث الإعدادات");
  }
}
