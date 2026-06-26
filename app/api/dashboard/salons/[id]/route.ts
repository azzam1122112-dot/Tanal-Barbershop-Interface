import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requireOwnerApi } from "@/lib/auth/http";
import { salonUpdateSchema } from "@/lib/auth/validation";
import { updateSalon } from "@/lib/organizations/organization-service";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toErrorResponse } from "@/lib/http/error-response";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireOwnerApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = salonUpdateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الصالون غير صحيحة" }, { status: 400 });
  }

  try {
    const salon = await updateSalon(prisma, session.organizationId, id, parsed.data);
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "salon.updated",
      entityType: "Salon",
      entityId: salon.id,
      after: { name: salon.name, isActive: salon.isActive },
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ salon: { id: salon.id, name: salon.name, slug: salon.slug, isActive: salon.isActive } });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث الصالون");
  }
}
