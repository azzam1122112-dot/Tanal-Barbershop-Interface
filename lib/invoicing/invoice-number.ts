import type { Prisma, PrismaClient } from "@prisma/client";
import { getRiyadhDateParts } from "@/lib/datetime/riyadh";

type InvoicePrisma = PrismaClient | Prisma.TransactionClient;

/**
 * يصدر رقم فاتورة تسلسليًا لكل فرع لكل سنة: `INV-2026-000001`.
 *
 * يجب استدعاؤها **داخل** معاملة تأكيد الزيارة (Serializable) — العدّاد صف واحد
 * لكل فرع/سنة، فالزيادة الذرّية فيه تمنع تكرار الرقم عند التسجيل المتزامن،
 * وأي تعارض يُعالَج بإعادة محاولة المعاملة نفسها (P2034).
 */
export async function issueInvoiceNumber(
  prisma: InvoicePrisma,
  input: { organizationId: string; salonId: string; date?: Date },
) {
  const year = getRiyadhDateParts(input.date ?? new Date()).year;

  const counter = await prisma.invoiceCounter.upsert({
    where: { salonId_year: { salonId: input.salonId, year } },
    create: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      year,
      lastNumber: 1,
    },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });

  return formatInvoiceNumber(year, counter.lastNumber);
}

export function formatInvoiceNumber(year: number, sequence: number) {
  return `INV-${year}-${String(sequence).padStart(6, "0")}`;
}
