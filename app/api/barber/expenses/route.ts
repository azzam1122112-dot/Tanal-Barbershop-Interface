import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestMeta, parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getOpenCashSession } from "@/lib/cash-sessions/cash-session-service";
import { getSessionExpenses, recordCashExpense } from "@/lib/expenses/expense-service";
import { toErrorResponse } from "@/lib/http/error-response";
import { BusinessError } from "@/lib/errors";

const barberExpenseSchema = z.object({
  amount: z.coerce.number().positive("قيمة المصروف يجب أن تكون أكبر من صفر"),
  category: z.enum(["SUPPLIES", "MAINTENANCE", "UTILITIES", "REFUND", "OTHER"]),
  paymentSource: z.enum(["CASH_DRAWER", "EXTERNAL"]).default("CASH_DRAWER"),
  note: z.string().trim().min(2, "اكتب سبب المصروف"),
  payee: z.string().trim().max(120).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
});

export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const open = await getOpenCashSession(prisma, session.barber.id);
  if (!open) return NextResponse.json({ expenses: [], total: 0 });

  const expenses = await getSessionExpenses(prisma, open.id);
  return NextResponse.json({
    expenses,
    total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
  });
}

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = barberExpenseSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات المصروف غير صحيحة" }, { status: 400 });
  }

  try {
    // الحلاق يسجّل ما خرج من درجه هو فقط، وضمن جلسة مفتوحة.
    const open = await getOpenCashSession(prisma, session.barber.id);
    if (!open) throw new BusinessError("افتح جلسة صندوق أولًا لتسجيل مصروف");

    const expense = await recordCashExpense(prisma, {
      organizationId: session.organizationId,
      salonId: session.salonId,
      cashSessionId: open.id,
      barberId: session.barber.id,
      amount: parsed.data.amount,
      category: parsed.data.category,
      paymentSource: parsed.data.paymentSource,
      note: parsed.data.note,
      payee: parsed.data.payee,
      reference: parsed.data.reference,
      recordedByBarberId: session.barber.id,
      auditMeta: await getRequestMeta(),
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل المصروف");
  }
}
