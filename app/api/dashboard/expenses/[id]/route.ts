import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { deleteCashExpense } from "@/lib/expenses/expense-service";
import { toErrorResponse } from "@/lib/http/error-response";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;

  try {
    await deleteCashExpense(prisma, id, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ message: "تم حذف المصروف" });
  } catch (error) {
    return toErrorResponse(error, "تعذر حذف المصروف");
  }
}
