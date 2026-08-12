import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { canManageProducts } from "@/lib/auth/access";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { createSupplyItem, listSupplyItems } from "@/lib/supplies/supply-service";
import { toErrorResponse } from "@/lib/http/error-response";

const createSchema = z.object({
  salonId: z.string().trim().min(1, "الفرع مطلوب"),
  name: z.string().trim().min(2, "اسم الصنف مطلوب").max(80),
  unit: z.string().trim().max(20).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const items = await listSupplyItems(prisma, {
    organizationId: session.organizationId,
    salonIds: effectiveSalonIds(session),
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  if (!canManageProducts(session)) {
    return NextResponse.json({ message: "لا تملك صلاحية إدارة المستلزمات" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات الصنف غير صحيحة" }, { status: 400 });
  }

  try {
    const item = await createSupplyItem(prisma, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      salonId: parsed.data.salonId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      sortOrder: parsed.data.sortOrder,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إضافة الصنف");
  }
}
