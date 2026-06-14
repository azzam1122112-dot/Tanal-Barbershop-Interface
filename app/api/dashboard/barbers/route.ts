import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { hashBarberPin } from "@/lib/auth/barber-pin";
import { createBarberSchema } from "@/lib/auth/validation";
import { requireDashboardApi, getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { toSafeBarber } from "@/lib/auth/sanitize";
import { writeAuditLog } from "@/lib/audit/audit-log";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const barbers = await prisma.barber.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ barbers: barbers.map((barber) => toSafeBarber(barber, true)) });
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const body = await parseJsonBody(request);
  const parsed = createBarberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الحلاق غير صحيحة" }, { status: 400 });
  }

  try {
    const barber = await prisma.barber.create({
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        accessPinHash: await hashBarberPin(parsed.data.pin),
        isActive: true,
      },
    });

    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "barber.created",
      entityType: "Barber",
      entityId: barber.id,
      after: toSafeBarber(barber, true),
      ...meta,
    });

    return NextResponse.json({ barber: toSafeBarber(barber, true) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "رقم الجوال مستخدم مسبقًا" }, { status: 409 });
    }

    throw error;
  }
}
