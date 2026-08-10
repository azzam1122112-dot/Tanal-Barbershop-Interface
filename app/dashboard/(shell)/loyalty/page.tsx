import { formatNumber } from "@/lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, Notice, SectionPanel, StatCard } from "@/components/dashboard/ui";
import { RewardRuleManager } from "@/components/dashboard/reward-rule-manager";
import { canAccessDashboard, canOperateLoyalty, canSetLoyaltyPolicy } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeRewardRule } from "@/lib/loyalty/reward-summary";

export default async function DashboardLoyaltyPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canOperateLoyalty(session)) redirect("/dashboard/forbidden");

  const canEditPolicy = canSetLoyaltyPolicy(session);
  const { organizationId, orgWhere, activeSalonId } = dashboardScope(session);
  const [settings, rewardRules, rewardReadyCount, activeCampaignsCount] = await Promise.all([
    activeSalonId
      ? prisma.systemSettings.findFirst({ where: { salonId: activeSalonId } })
      : prisma.systemSettings.findFirst({ where: orgWhere }),
    prisma.rewardRule.findMany({ where: orgWhere, orderBy: [{ sortOrder: "asc" }, { requiredPoints: "asc" }] }),
    countRewardReadyCustomers(organizationId),
    organizationId
      ? prisma.campaign.count({
          where: { organizationId, isActive: true, startAt: { lte: new Date() }, endAt: { gte: new Date() } },
        })
      : Promise.resolve(0),
  ]);

  return (
    <DashboardShell
      title="الولاء والمكافآت"
      description={
        canEditPolicy
          ? "ضبط طريقة احتساب النقاط وقواعد الاستبدال التي تظهر للموظفين عند زيارة العميل."
          : "قواعد الولاء المعتمدة في مؤسستك، وأدوات تشغيلها مع عملاء فروعك."
      }
    >
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="كل ريال يساوي" value={`${settings ? Number(settings.pointsPerCurrencyUnit) : 1} نقطة`} />
        <StatCard label="احتساب النقاط" value={settings?.pointsCalculatedAfterDiscount ?? true ? "بعد الخصم" : "قبل الخصم"} />
        <StatCard label="عملاء جاهزون لمكافأة" value={formatNumber(rewardReadyCount)} />
        <StatCard label="حملات فعّالة الآن" value={formatNumber(activeCampaignsCount)} />
      </div>

      {canEditPolicy ? null : (
        <Notice tone="gold" className="mt-6" title="سياسة الولاء يضبطها المالك أو المدير">
          معدّل النقاط وقواعد المكافآت موحّدة على مستوى المؤسسة كلها حتى يجمع العميل نقاطه من أي فرع. دورك هو تشغيل
          البرنامج: صرف المكافآت، إدارة الحملات، ومراسلة العملاء.
        </Notice>
      )}

      <SectionPanel title={canEditPolicy ? "قواعد استبدال النقاط" : "قواعد الاستبدال المعتمدة"} className="mt-6">
        <div className="px-5 pb-5">
          <RewardRuleManager initialRules={rewardRules.map(toSafeRewardRule)} readOnly={!canEditPolicy} />
        </div>
      </SectionPanel>

      <SectionPanel title="تشغيل برنامج الولاء" className="mt-6">
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <LoyaltyAction
            href="/dashboard/customers"
            title="مكافآت العملاء"
            description="اصرف مكافأة مدير لعميل مميز أو راجع رصيد نقاطه."
          />
          <LoyaltyAction
            href="/dashboard/campaigns"
            title="الحملات والعروض"
            description="أنشئ حملة موسمية واستهدف شريحة عملاء محددة."
          />
          <LoyaltyAction
            href="/dashboard/whatsapp"
            title="مراسلة العملاء"
            description="جهّز رسائل واتساب لمن استحق مكافأة أو انقطع عن الزيارة."
          />
        </div>
      </SectionPanel>
    </DashboardShell>
  );
}

/** عدد العملاء الذين بلغ رصيدهم أدنى قاعدة مكافأة فعّالة — مؤشر تشغيلي للمشرف. */
async function countRewardReadyCustomers(organizationId: string | undefined) {
  if (!organizationId) return 0;
  const lowestRule = await prisma.rewardRule.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { requiredPoints: "asc" },
    select: { requiredPoints: true },
  });
  if (!lowestRule) return 0;
  return prisma.loyaltyAccount.count({
    where: { organizationId, points: { gte: lowestRule.requiredPoints } },
  });
}

function LoyaltyAction({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="lux-hover group rounded-xl border border-salon-line bg-white px-4 py-4 transition hover:border-salon-gold"
    >
      <p className="text-base font-bold text-salon-ink">{title}</p>
      <p className="dashboard-muted mt-1.5 text-sm leading-6">{description}</p>
      <span className="mt-3 inline-block text-sm font-bold text-salon-forest transition group-hover:text-salon-gold">
        فتح ←
      </span>
    </Link>
  );
}
