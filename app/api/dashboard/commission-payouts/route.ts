import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requireCommissionPayoutApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { listCommissionPayouts, payCommission } from "@/lib/commissions/commission-payout";
import { toErrorResponse } from "@/lib/http/error-response";

const payoutSchema = z.object({
  barberId: z.string().min(1, "اختر الحلاق"),
  amount: z.coerce.number().positive("مبلغ الصرف يجب أن يكون أكبر من صفر"),
  method: z.enum(["BANK_TRANSFER", "CASH_FROM_SAFE", "BARBER_CUSTODY_DEDUCTION", "OPENING_SETTLEMENT"]),
  periodFrom: z.string().optional().nullable(),
  periodTo: z.string().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  // مفتاح فريد من العميل: الضغط المزدوج لا يصرف مرتين.
  idempotencyKey: z.string().min(8).max(120),
});

export async function GET(request: Request) {
  const auth = await requireCommissionPayoutApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const url = new URL(request.url);
  const payouts = await listCommissionPayouts(prisma, {
    organizationId: session.organizationId,
    salonIds: effectiveSalonIds(session),
    barberId: url.searchParams.get("barberId") || undefined,
  });

  return NextResponse.json({ payouts });
}

export async function POST(request: Request) {
  const auth = await requireCommissionPayoutApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return NextResponse.json({ message: "صلاحية غير كافية" }, { status: 403 });
  }

  const parsed = payoutSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات الصرف غير صحيحة" }, { status: 400 });
  }

  try {
    const payout = await payCommission(prisma, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      barberId: parsed.data.barberId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      periodFrom: parsed.data.periodFrom,
      periodTo: parsed.data.periodTo,
      reference: parsed.data.reference,
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
      actorUserId: session.user.id,
      actorType: session.role,
      auditMeta: await getRequestMeta(),
    });

    return NextResponse.json({ payout }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل صرف العمولة");
  }
}
