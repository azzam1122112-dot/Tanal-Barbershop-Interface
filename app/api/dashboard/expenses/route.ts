import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { assertSalonAllowed, effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { getExpensesReport, recordCashExpense } from "@/lib/expenses/expense-service";
import { toErrorResponse } from "@/lib/http/error-response";

const createExpenseSchema = z.object({
  salonId: z.string().min(1, "الفرع مطلوب"),
  cashSessionId: z.string().min(1).optional().nullable(),
  barberId: z.string().min(1).optional().nullable(),
  amount: z.coerce.number().positive("قيمة المصروف يجب أن تكون أكبر من صفر"),
  category: z.enum(["SUPPLIES", "MAINTENANCE", "UTILITIES", "STAFF_ADVANCE", "REFUND", "OTHER"]),
  note: z.string().trim().min(2, "اكتب سبب المصروف"),
});

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const url = new URL(request.url);
  const report = await getExpensesReport(prisma, {
    organizationId: session.organizationId,
    salonIds: effectiveSalonIds(session),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  return NextResponse.json(report);
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = createExpenseSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات المصروف غير صحيحة" }, { status: 400 });
  }

  try {
    assertSalonAllowed(session, parsed.data.salonId);
    const expense = await recordCashExpense(prisma, {
      organizationId: session.organizationId,
      salonId: parsed.data.salonId,
      cashSessionId: parsed.data.cashSessionId,
      barberId: parsed.data.barberId,
      amount: parsed.data.amount,
      category: parsed.data.category,
      note: parsed.data.note,
      recordedByUserId: session.user.id,
      auditMeta: await getRequestMeta(),
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل المصروف");
  }
}
