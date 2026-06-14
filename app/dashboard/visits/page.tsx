import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, EmptyState, FilterBar, TablePanel } from "@/components/dashboard/ui";
import { VisitAdminActions } from "@/components/dashboard/visit-admin-actions";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toVisitDashboardRow } from "@/lib/visits/visit-summary";

export default async function DashboardVisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; paymentMethod?: string; barberId?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const [visits, barbers, rewardRules, campaigns] = await Promise.all([
    prisma.visit.findMany({
      where: {
        ...(params.paymentMethod === "CASH" || params.paymentMethod === "NETWORK" ? { paymentMethod: params.paymentMethod } : {}),
        ...(params.barberId ? { barberId: params.barberId } : {}),
        ...(params.q
          ? {
              OR: [
                { customer: { name: { contains: params.q, mode: "insensitive" } } },
                { customer: { phone: { contains: params.q.replace(/^\+/, "") } } },
              ],
            }
          : {}),
      },
      include: { customer: true, barber: true, services: true, cancelledBy: true },
      orderBy: { visitedAt: "desc" },
      take: 100,
    }),
    prisma.barber.findMany({ orderBy: { name: "asc" } }),
    prisma.rewardRule.findMany(),
    prisma.campaign.findMany(),
  ]);

  const rows = visits.map(toVisitDashboardRow);
  const rewardById = new Map(rewardRules.map((reward) => [reward.id, `خصم ${Number(reward.discountAmount)} / ${reward.requiredPoints} نقطة`]));
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));

  return (
    <DashboardShell title="الزيارات" description="متابعة الزيارات المؤكدة والملغاة، تصفية السجل، وإجراء التصحيحات المصرح بها عند الحاجة.">
        <FilterBar className="md:grid-cols-[1fr_160px_180px_120px]">
          <input name="q" defaultValue={params.q} placeholder="بحث باسم أو جوال العميل" className="dashboard-field" />
          <select name="paymentMethod" defaultValue={params.paymentMethod ?? ""} className="dashboard-field">
            <option value="">كل طرق الدفع</option>
            <option value="CASH">كاش</option>
            <option value="NETWORK">شبكة</option>
          </select>
          <select name="barberId" defaultValue={params.barberId ?? ""} className="dashboard-field">
            <option value="">كل الحلاقين</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
          <button className="dashboard-button">تصفية</button>
        </FilterBar>

        <TablePanel>
          <table className="dashboard-table min-w-[1260px]">
            <thead>
              <tr>
                <th className="px-3 py-3 text-right">التاريخ</th>
                <th className="px-3 py-3 text-right">العميل</th>
                <th className="px-3 py-3 text-right">الحلاق</th>
                <th className="px-3 py-3 text-right">الخدمات</th>
                <th className="px-3 py-3 text-right">المبلغ</th>
                <th className="px-3 py-3 text-right">الخصم</th>
                <th className="px-3 py-3 text-right">الصافي</th>
                <th className="px-3 py-3 text-right">النقاط</th>
                <th className="px-3 py-3 text-right">نوع الخصم</th>
                <th className="px-3 py-3 text-right">الدفع</th>
                <th className="px-3 py-3 text-right">الحالة</th>
                <th className="px-3 py-3 text-right">إدارة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-salon-line">
              {rows.map((visit) => (
                <tr key={visit.id}>
                  <td className="px-3 py-3">{new Date(visit.visitedAt).toLocaleString("ar-SA")}</td>
                  <td className="px-3 py-3">{visit.customer.name}<br /><span className="text-salon-charcoal">{visit.customer.phone}</span></td>
                  <td className="px-3 py-3">{visit.barber.name}</td>
                  <td className="px-3 py-3">{visit.services.join("، ")}</td>
                  <td className="px-3 py-3">{visit.grossAmount}</td>
                  <td className="px-3 py-3">{visit.discountAmount}</td>
                  <td className="px-3 py-3 font-bold">{visit.netAmount}</td>
                  <td className="px-3 py-3">{visit.pointsEarned}</td>
                  <td className="px-3 py-3">{discountLabel(visit.discountType, visit.rewardRuleId, visit.campaignId, rewardById, campaignById)}</td>
                  <td className="px-3 py-3">{visit.paymentMethod === "CASH" ? "كاش" : "شبكة"}</td>
                  <td className="px-3 py-3">{visit.status === "COMPLETED" ? "مؤكدة" : "ملغاة"}</td>
                  <td className="px-3 py-3">
                    <div className="space-y-2">
                      <Link
                        href={`/dashboard/whatsapp?customerId=${visit.customer.id}&visitId=${visit.id}`}
                        className="block rounded-lg bg-salon-forest px-3 py-2 text-center font-bold text-white transition hover:bg-salon-forest/90"
                      >
                        رسالة واتساب
                      </Link>
                      <VisitAdminActions visit={visit} />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={12} className="px-4 py-8"><EmptyState title="لا توجد زيارات" description="غيّر الفلاتر أو وسّع البحث لرؤية نتائج أكثر." /></td></tr> : null}
            </tbody>
          </table>
        </TablePanel>
    </DashboardShell>
  );
}

function discountLabel(
  discountType: "NONE" | "REWARD" | "CAMPAIGN",
  rewardRuleId: string | null,
  campaignId: string | null,
  rewardById: Map<string, string>,
  campaignById: Map<string, string>,
) {
  if (discountType === "REWARD") return `مكافأة نقاط - ${rewardRuleId ? rewardById.get(rewardRuleId) ?? "مكافأة" : "مكافأة"}`;
  if (discountType === "CAMPAIGN") return `حملة - ${campaignId ? campaignById.get(campaignId) ?? "حملة" : "حملة"}`;
  return "بدون";
}
