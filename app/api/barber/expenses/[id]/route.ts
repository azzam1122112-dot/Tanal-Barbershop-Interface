import { NextResponse } from "next/server";
import { requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { deleteCashExpense } from "@/lib/expenses/expense-service";
import { toErrorResponse } from "@/lib/http/error-response";

/** حذف مصروف سجّله الحلاق نفسه ضمن جلسة صندوق ما زالت مفتوحة. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;

  try {
    const deleted = await deleteCashExpense(prisma, id, {
      organizationId: session.organizationId,
      actorBarberId: session.barber.id,
      actorType: "BARBER",
    });
    return NextResponse.json(deleted);
  } catch (error) {
    return toErrorResponse(error, "تعذر حذف المصروف");
  }
}
