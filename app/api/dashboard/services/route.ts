import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { serviceCreateSchema } from "@/lib/auth/validation";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toSafeService } from "@/lib/services/service-summary";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const services = await prisma.service.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ services: services.map((service) => toSafeService(service, true)) });
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = serviceCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الخدمة غير صحيحة" }, { status: 400 });
  }

  try {
    const service = await prisma.service.create({
      data: parsed.data,
    });
    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "service.created",
      entityType: "Service",
      entityId: service.id,
      after: toSafeService(service, true),
      ...meta,
    });

    return NextResponse.json({ service: toSafeService(service, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "اسم الخدمة مستخدم مسبقًا" }, { status: 409 });
    }
    throw error;
  }
}
