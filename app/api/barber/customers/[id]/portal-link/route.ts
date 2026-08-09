import { NextResponse } from "next/server";
import { requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { ensurePortalToken } from "@/lib/customers/customer-portal";
import { toErrorResponse } from "@/lib/http/error-response";

/**
 * رابط صفحة نقاط العميل ليسلّمه الحلاق للعميل عند الزيارة.
 * مقيّد بمؤسسة الحلاق — لا يُصدر رابطًا لعميل مستأجر آخر.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;

  try {
    const token = await ensurePortalToken(prisma, id, session.organizationId);
    return NextResponse.json({ path: `/my/${token}` });
  } catch (error) {
    return toErrorResponse(error, "تعذر إنشاء رابط العميل");
  }
}
