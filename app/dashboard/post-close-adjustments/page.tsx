import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getPostCloseAdjustmentReport } from "@/lib/post-close-adjustments/post-close-adjustment-report";

export default async function PostCloseAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; barberId?: string; adjustmentType?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const [barbers, report] = await Promise.all([
    prisma.barber.findMany({ orderBy: { name: "asc" } }),
    getPostCloseAdjustmentReport(prisma, {
      from: params.from,
      to: params.to,
      barberId: params.barberId,
      adjustmentType: parseAdjustmentType(params.adjustmentType),
    }),
  ]);

  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">لوحة الإدارة</Link>
            <h1 className="mt-2 text-3xl font-bold">تصحيحات ما بعد الإغلاق</h1>
          </div>
          <LogoutButton />
        </div>

        <form className="mt-6 grid gap-3 rounded-lg border border-salon-line bg-white p-4 md:grid-cols-[150px_150px_1fr_220px_120px]">
          <input name="from" type="date" defaultValue={params.from ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <input name="to" type="date" defaultValue={params.to ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <select name="barberId" defaultValue={params.barberId ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">كل الحلاقين</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
          <select name="adjustmentType" defaultValue={params.adjustmentType ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">كل التصحيحات</option>
            <option value="VISIT_CANCELLED">إلغاء زيارة</option>
            <option value="VISIT_PAYMENT_METHOD_UPDATED">تعديل طريقة الدفع</option>
            <option value="VISIT_AMOUNT_UPDATED">تعديل مبلغ</option>
          </select>
          <button className="rounded-md bg-salon-ink px-4 py-3 font-bold text-white">تصفية</button>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="عدد التصحيحات" value={report.summary.count.toString()} />
          <MetricCard label="فرق الكاش" value={formatMoney(report.summary.cashDelta)} />
          <MetricCard label="فرق الشبكة" value={formatMoney(report.summary.cardDelta)} />
          <MetricCard label="فرق الصافي" value={formatMoney(report.summary.netDelta)} />
          <MetricCard label="فرق النقاط" value={report.summary.pointsDelta.toString()} />
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border border-salon-line bg-white">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="bg-salon-mist text-salon-charcoal">
              <tr>
                <th className="px-3 py-3 text-right">وقت التصحيح</th>
                <th className="px-3 py-3 text-right">النوع</th>
                <th className="px-3 py-3 text-right">الزيارة</th>
                <th className="px-3 py-3 text-right">الحلاق</th>
                <th className="px-3 py-3 text-right">العميل</th>
                <th className="px-3 py-3 text-right">السبب</th>
                <th className="px-3 py-3 text-right">المستخدم</th>
                <th className="px-3 py-3 text-right">الأثر المالي</th>
                <th className="px-3 py-3 text-right">أثر النقاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-salon-line">
              {report.adjustments.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td className="px-3 py-3">{new Date(adjustment.createdAt).toLocaleString("ar-SA")}</td>
                  <td className="px-3 py-3">{typeLabel(adjustment.type)}</td>
                  <td className="px-3 py-3">{new Date(adjustment.visitDate).toLocaleString("ar-SA")}<br /><span className="text-xs text-salon-charcoal">{adjustment.visitId}</span></td>
                  <td className="px-3 py-3">{adjustment.barberName}</td>
                  <td className="px-3 py-3">{adjustment.customerName}<br /><span className="text-salon-charcoal">{adjustment.customerPhone}</span></td>
                  <td className="px-3 py-3">{adjustment.reason || "-"}</td>
                  <td className="px-3 py-3">{adjustment.actorName}</td>
                  <td className="px-3 py-3">
                    صافي: {formatMoney(adjustment.financialImpact.netDelta)}<br />
                    كاش: {formatMoney(adjustment.financialImpact.cashDelta)}<br />
                    شبكة: {formatMoney(adjustment.financialImpact.cardDelta)}
                  </td>
                  <td className="px-3 py-3">
                    مكتسبة: {adjustment.pointsImpact.earnedPointsDelta}<br />
                    مستعادة: {adjustment.pointsImpact.redeemedPointsDelta}<br />
                    النهائي: {adjustment.pointsImpact.finalBalanceChange}
                  </td>
                </tr>
              ))}
              {report.adjustments.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-salon-charcoal">لا توجد تصحيحات بعد الإغلاق</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-salon-line bg-white p-4">
      <p className="text-sm text-salon-charcoal">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function parseAdjustmentType(value: string | undefined) {
  if (value === "VISIT_CANCELLED" || value === "VISIT_PAYMENT_METHOD_UPDATED" || value === "VISIT_AMOUNT_UPDATED") return value;
  return undefined;
}

function typeLabel(type: string) {
  if (type === "VISIT_CANCELLED") return "إلغاء زيارة";
  if (type === "VISIT_PAYMENT_METHOD_UPDATED") return "تعديل طريقة الدفع";
  if (type === "VISIT_AMOUNT_UPDATED") return "تعديل مبلغ";
  return type;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ريال`;
}
