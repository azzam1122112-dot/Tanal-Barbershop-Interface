import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { RewardRuleManager } from "@/components/dashboard/reward-rule-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeRewardRule } from "@/lib/loyalty/reward-summary";

export default async function DashboardLoyaltyPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const [settings, rewardRules] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { singletonKey: "default" } }),
    prisma.rewardRule.findMany({ orderBy: [{ sortOrder: "asc" }, { requiredPoints: "asc" }] }),
  ]);

  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">لوحة الإدارة</Link>
            <h1 className="mt-2 text-3xl font-bold">الولاء والمكافآت</h1>
          </div>
          <LogoutButton />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-salon-line bg-white p-5">
            <p className="text-sm text-salon-charcoal">كل ريال يساوي</p>
            <p className="mt-2 text-2xl font-bold">{settings ? Number(settings.pointsPerCurrencyUnit) : 1} نقطة</p>
          </div>
          <div className="rounded-lg border border-salon-line bg-white p-5">
            <p className="text-sm text-salon-charcoal">احتساب النقاط</p>
            <p className="mt-2 text-2xl font-bold">{settings?.pointsCalculatedAfterDiscount ?? true ? "بعد الخصم" : "قبل الخصم"}</p>
          </div>
          <div className="rounded-lg border border-salon-line bg-white p-5">
            <p className="text-sm text-salon-charcoal">تعدد الخصومات</p>
            <p className="mt-2 text-2xl font-bold">{settings?.allowMultipleDiscounts ? "مسموح" : "غير مسموح"}</p>
          </div>
        </div>

        <RewardRuleManager initialRules={rewardRules.map(toSafeRewardRule)} />
      </section>
    </main>
  );
}
