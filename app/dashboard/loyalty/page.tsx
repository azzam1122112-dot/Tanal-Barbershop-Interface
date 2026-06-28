import { redirect } from "next/navigation";
import { DashboardShell, StatCard } from "@/components/dashboard/ui";
import { RewardRuleManager } from "@/components/dashboard/reward-rule-manager";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeRewardRule } from "@/lib/loyalty/reward-summary";

export default async function DashboardLoyaltyPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session)) redirect("/dashboard");

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const salonId = session.type === "dashboard" ? session.salonId : null;
  const [settings, rewardRules] = await Promise.all([
    salonId ? prisma.systemSettings.findFirst({ where: { salonId } }) : prisma.systemSettings.findFirst({ where: { ...(organizationId ? { organizationId } : {}) } }),
    prisma.rewardRule.findMany({ where: { ...(organizationId ? { organizationId } : {}) }, orderBy: [{ sortOrder: "asc" }, { requiredPoints: "asc" }] }),
  ]);

  return (
    <DashboardShell title="الولاء والمكافآت" description="ضبط طريقة احتساب النقاط وقواعد الاستبدال التي تظهر للموظفين عند زيارة العميل.">
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="كل ريال يساوي" value={`${settings ? Number(settings.pointsPerCurrencyUnit) : 1} نقطة`} />
        <StatCard label="احتساب النقاط" value={settings?.pointsCalculatedAfterDiscount ?? true ? "بعد الخصم" : "قبل الخصم"} />
        <StatCard label="تعدد الخصومات" value={settings?.allowMultipleDiscounts ? "مسموح" : "غير مسموح"} />
      </div>

      <RewardRuleManager initialRules={rewardRules.map(toSafeRewardRule)} />
    </DashboardShell>
  );
}
