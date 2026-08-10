import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icons";
import { LoyaltyJoinForm } from "@/components/public/loyalty-join-form";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { getKnownLoginOrgSlug } from "@/lib/tenant/request-org";

export const metadata: Metadata = {
  title: "انضم لبرنامج الولاء",
  description: "عضويتك المجانية لمتابعة النقاط والمكافآت مع كل زيارة.",
  robots: { index: false, follow: false },
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
  const organizationSlug = params.org ?? await getKnownLoginOrgSlug();
  const organization = organizationSlug
    ? await prisma.organization.findUnique({ where: { slug: organizationSlug } })
    : null;

  if (!organization || organization.status === "SUSPENDED") notFound();

  const [settings, rewardRules, owner] = await Promise.all([
    getEffectiveSettings(prisma, { organizationId: organization.id }),
    prisma.rewardRule.findMany({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { requiredPoints: "asc" },
      take: 3,
    }),
    prisma.user.findFirst({
      where: { organizationId: organization.id, role: "OWNER", isActive: true },
      select: { email: true, phone: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const brandName = settings?.legalName?.trim() || settings?.salonName || organization.name;
  const pointsPerRiyal = settings ? Number(settings.pointsPerCurrencyUnit) : 1;
  const pointsLabel = pointsPerRiyal === 1 ? "نقطة" : `${pointsPerRiyal} نقاط`;

  return (
    <main className="loyalty-join-page relative min-h-screen overflow-hidden bg-salon-onyx text-white">
      <div aria-hidden="true" className="loyalty-ambient loyalty-ambient-top" />
      <div aria-hidden="true" className="loyalty-ambient loyalty-ambient-bottom" />
      <div aria-hidden="true" className="loyalty-grid absolute inset-0 opacity-50" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-7 pt-5 sm:px-7 sm:pb-10 sm:pt-7 lg:px-10">
        <nav className="flex items-center justify-between border-b border-white/[0.08] pb-5" aria-label="هوية برنامج الولاء">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-11 w-11 rounded-xl ring-1 ring-white/10" priority />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.24em] text-violet-300" dir="ltr">XMANSX LOYALTY</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white/90">{brandName}</p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-2 text-[11px] font-bold text-emerald-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
            </span>
            تسجيل آمن ومجاني
          </span>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-9 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.72fr)] lg:gap-16 lg:py-12 xl:gap-24">
          <section className="mx-auto w-full max-w-2xl lg:mx-0">
            <div className="loyalty-enter loyalty-enter-one inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-3.5 py-2 text-xs font-bold text-violet-200">
              <Icon name="loyalty" className="h-4 w-4" />
              عضوية تليق بكل زيارة
            </div>

            <h1 className="loyalty-enter loyalty-enter-two mt-6 text-[clamp(2.35rem,7vw,5.4rem)] font-bold leading-[1.08] tracking-tight">
              زيارتك اليوم،
              <span className="loyalty-title-gradient mt-1 block">مكافأتك غدًا.</span>
            </h1>
            <p className="loyalty-enter loyalty-enter-three mt-6 max-w-xl text-base font-medium leading-8 text-white/58 sm:text-lg sm:leading-9">
              سجّل مرة واحدة، واجمع {pointsLabel} مع كل ريال. نقاطك ومكافآتك وحجوزاتك تبقى معك في بطاقة رقمية واحدة.
            </p>

            <div className="loyalty-enter loyalty-enter-four relative mt-9 max-w-xl sm:mt-11">
              <div className="loyalty-member-card relative overflow-hidden rounded-[1.75rem] border border-white/[0.13] p-5 shadow-2xl sm:p-7">
                <div aria-hidden="true" className="loyalty-card-orbit" />
                <div className="relative flex items-start justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.25em] text-violet-200/70" dir="ltr">MEMBER BENEFIT</p>
                    <h2 className="mt-2 text-xl font-bold sm:text-2xl">بطاقة المكافآت الرقمية</h2>
                  </div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-violet-200/20 bg-violet-200/[0.1] text-violet-200 shadow-[0_0_32px_rgba(167,139,250,0.16)]">
                    <Icon name="loyalty" className="h-6 w-6" />
                  </div>
                </div>

                <div className="relative mt-8 flex items-end justify-between gap-5 border-t border-white/[0.1] pt-5">
                  <div>
                    <p className="text-xs font-semibold text-white/45">معدل الكسب</p>
                    <p className="mt-1 text-lg font-bold text-white">
                      <span className="text-3xl tabular-nums text-violet-200">{pointsPerRiyal}</span> {pointsPerRiyal === 1 ? "نقطة" : "نقاط"} / ريال
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white/45">العضوية</p>
                    <p className="mt-1 text-sm font-bold text-emerald-200">مجانية دائمًا</p>
                  </div>
                </div>
              </div>

              <div className="loyalty-reward-float absolute -bottom-5 left-4 rounded-2xl border border-violet-200/20 bg-[#1d1729]/95 px-4 py-3 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur sm:-left-5 sm:bottom-6">
                {rewardRules.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-400 text-sm font-black text-white">
                      {rewardRules.length}
                    </span>
                    <div>
                      <p className="text-[10px] font-semibold text-white/45">مكافآت متاحة</p>
                      <p className="mt-0.5 text-xs font-bold text-white">
                        تبدأ من {rewardRules[0].requiredPoints} نقطة
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Icon name="check" className="h-5 w-5 text-emerald-300" />
                    <p className="text-xs font-bold">نقاطك تُحفظ تلقائيًا</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12 grid max-w-xl grid-cols-3 gap-2 border-t border-white/[0.08] pt-6 sm:gap-5">
              {[
                ["01", "سجّل بياناتك"],
                ["02", "اجمع النقاط"],
                ["03", "استمتع بمكافأتك"],
              ].map(([number, label]) => (
                <div key={number} className="flex items-center gap-2.5">
                  <span className="text-xs font-black tabular-nums text-violet-300">{number}</span>
                  <span className="text-[11px] font-semibold leading-5 text-white/48 sm:text-xs">{label}</span>
                </div>
              ))}
            </div>
          </section>

          <aside className="loyalty-form-shell mx-auto w-full max-w-lg lg:mx-0" aria-label="نموذج الانضمام">
            <LoyaltyJoinForm
              organizationSlug={organization.slug}
              brandName={brandName}
              controllerEmail={owner?.email ?? null}
              controllerPhone={owner?.phone ?? null}
            />
          </aside>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/[0.07] pt-5 text-[11px] font-medium text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>يعالج الصالون بيانات العضوية وفق إشعار الخصوصية المعروض قبل التسجيل.</p>
          <p dir="ltr">POWERED BY <span className="font-bold text-white/55">XMANSX</span></p>
        </footer>
      </div>
    </main>
  );
}
