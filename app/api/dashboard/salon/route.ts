import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";

// تبديل الصالون النشط في الجلسة (لمالك المؤسسة بعدة فروع).
export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const { salonId } = await parseJsonBody<{ salonId?: string | null }>(request);

  // قيمة فارغة/null/"all" تعني عرض كل الفروع مجتمعة (إلغاء الفرع النشط).
  if (!salonId || salonId === "all") {
    await prisma.session.update({
      where: { id: session.id },
      data: { activeSalonId: null },
    });
    return NextResponse.json({ salon: null });
  }

  const salon = await prisma.salon.findFirst({
    where: { id: salonId, organizationId: session.organizationId, isActive: true },
    select: { id: true, name: true },
  });
  if (!salon) {
    return NextResponse.json({ message: "الصالون غير موجود" }, { status: 404 });
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { activeSalonId: salon.id },
  });

  return NextResponse.json({ salon });
}
