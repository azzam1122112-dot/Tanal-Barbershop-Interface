import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { serviceUpdateSchema } from "@/lib/auth/validation";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toSafeService } from "@/lib/services/service-summary";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request);
  const parsed = serviceUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الخدمة غير صحيحة" }, { status: 400 });
  }

  const before = await prisma.service.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!before) {
    return NextResponse.json({ message: "الخدمة غير موجودة" }, { status: 404 });
  }

  try {
    const service = await prisma.service.update({
      where: { id },
      data: parsed.data,
    });
    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action:
        before.isActive !== service.isActive
          ? service.isActive
            ? "service.enabled"
            : "service.disabled"
          : "service.updated",
      entityType: "Service",
      entityId: service.id,
      before: toSafeService(before, true),
      after: toSafeService(service, true),
      ...meta,
    });

    return NextResponse.json({ service: toSafeService(service, true) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "اسم الخدمة مستخدم مسبقًا" }, { status: 409 });
    }
    throw error;
  }
}
