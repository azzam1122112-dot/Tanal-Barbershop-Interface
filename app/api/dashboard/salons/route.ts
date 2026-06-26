import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requireOwnerApi } from "@/lib/auth/http";
import { salonCreateSchema } from "@/lib/auth/validation";
import { createSalon, listSalons } from "@/lib/organizations/organization-service";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toErrorResponse } from "@/lib/http/error-response";

export async function GET() {
  const auth = await requireOwnerApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const salons = await listSalons(prisma, session.organizationId);
  return NextResponse.json({ salons });
}

export async function POST(request: Request) {
  const auth = await requireOwnerApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = salonCreateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات الصالون غير صحيحة" }, { status: 400 });
  }

  try {
    const salon = await createSalon(prisma, session.organizationId, parsed.data);
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "salon.created",
      entityType: "Salon",
      entityId: salon.id,
      after: { name: salon.name, slug: salon.slug },
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ salon: { id: salon.id, name: salon.name, slug: salon.slug, isActive: salon.isActive } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إنشاء الصالون");
  }
}
