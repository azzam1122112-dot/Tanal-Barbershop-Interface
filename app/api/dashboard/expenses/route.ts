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
  paymentSource: z.enum(["CASH_DRAWER", "EXTERNAL"]).default("EXTERNAL"),
  note: z.string().trim().min(2, "اكتب سبب المصروف"),
  payee: z.string().trim().max(120).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ المصروف غير صحيح").optional(),
});

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const url = new URL(request.url);
  const category = z.enum(["SUPPLIES", "MAINTENANCE", "UTILITIES", "STAFF_ADVANCE", "REFUND", "OTHER"]).safeParse(
    url.searchParams.get("category"),
  );
  const paymentSource = z.enum(["CASH_DRAWER", "EXTERNAL"]).safeParse(url.searchParams.get("paymentSource"));
  const report = await getExpensesReport(prisma, {
    organizationId: session.organizationId,
    salonIds: effectiveSalonIds(session),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    category: category.success ? category.data : null,
    paymentSource: paymentSource.success ? paymentSource.data : null,
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
      paymentSource: parsed.data.paymentSource,
      note: parsed.data.note,
      payee: parsed.data.payee,
      reference: parsed.data.reference,
      expenseDate: parsed.data.expenseDate ? new Date(`${parsed.data.expenseDate}T00:00:00`) : undefined,
      recordedByUserId: session.user.id,
      recordedByActorType: session.role,
      auditMeta: await getRequestMeta(),
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل المصروف");
  }
}
