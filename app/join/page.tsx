import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { LoyaltyJoinForm } from "@/components/public/loyalty-join-form";
import { prisma } from "@/lib/db/prisma";
import { resolveRequestOrganization } from "@/lib/tenant/request-org";
import { getEffectiveSettings } from "@/lib/settings/system-settings";

export const metadata: Metadata = {
  title: "انضم لبرنامج الولاء",
};

/**
 * صفحة تسجيل ذاتي عامة. يُعرض رابطها (أو رمز QR) داخل الصالون
 * فيسجّل العميل نفسه بلا حاجة لانتظار الحلاق.
 */
export default async function LoyaltyJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const params = await searchParams;
  const organization = params.org
    ? await prisma.organization.findUnique({ where: { slug: params.org } })
    : await resolveRequestOrganization();

  if (!organization || organization.status === "SUSPENDED") notFound();

  const [settings, rewardRules] = await Promise.all([
    getEffectiveSettings(prisma, { organizationId: organization.id }),
    prisma.rewardRule.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { requiredPoints: "asc" },
      take: 3,
    }),
  ]);

  const brandName = settings?.legalName?.trim() || settings?.salonName || organization.name;
  const pointsPerRiyal = settings ? Number(settings.pointsPerCurrencyUnit) : 1;

  return (
    <main className="min-h-screen bg-salon-mist px-4 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <header className="lux-edge rounded-2xl border border-white/10 bg-sidebar-onyx px-6 py-8 text-center text-white shadow-[var(--shadow-lg)]">
          <BrandLogo className="mx-auto h-16 w-16 ring-1 ring-salon-gold/30" priority />
          <p className="mt-4 text-xs font-bold uppercase tracking-eyebrow text-salon-goldlight">برنامج الولاء</p>
          <h1 className="mt-2 text-2xl font-bold">{brandName}</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-white/70">
            اجمع نقاطًا مع كل زيارة واستبدلها بخصومات. التسجيل مرة واحدة ومجاني.
          </p>
        </header>

        <section className="barber-card px-6 py-5">
          <h2 className="text-base font-bold">كيف يعمل؟</h2>
          <ol className="mt-3 space-y-2.5 text-sm font-semibold text-salon-charcoal">
            <li>1. سجّل اسمك ورقمك من النموذج أدناه.</li>
            <li>
              2. اكسب {pointsPerRiyal === 1 ? "نقطة" : `${pointsPerRiyal} نقاط`} عن كل ريال تدفعه في زياراتك.
            </li>
            <li>3. استبدل نقاطك بخصم عند بلوغك المكافأة.</li>
          </ol>

          {rewardRules.length > 0 ? (
            <div className="mt-4 border-t border-salon-line pt-4">
              <p className="text-xs font-bold text-salon-charcoal/70">مكافآتنا الحالية</p>
              <ul className="mt-2 space-y-1.5">
                {rewardRules.map((rule) => (
                  <li key={rule.id} className="flex items-baseline justify-between gap-3 text-sm font-bold">
                    <span>{rule.requiredPoints} نقطة</span>
                    <span className="tabular-nums text-salon-forest">خصم {Number(rule.discountAmount)} ريال</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <LoyaltyJoinForm organizationSlug={params.org} />
      </div>
    </main>
  );
}
