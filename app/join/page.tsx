import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Icon } from "@/components/icons";
import { JoinOrganizationPanel } from "@/components/public/join-organization-panel";
import { getRequestCustomerSession } from "@/lib/customers/account-http";
import { decodeJoinContext, encodeJoinContext } from "@/lib/customers/join-context";
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
  searchParams: Promise<{ org?: string; state?: string }>;
}) {
  const params = await searchParams;
  // `state` هو سياق موقّع يعود من صفحات المصادقة؛ `org` هو الدخول الأول من رمز
  // الصالون. الخادم يحلّ الـ slug في الحالتين ولا يثق بمعرّف مؤسسة من الواجهة.
  const returned = decodeJoinContext(params.state);
  const organizationSlug = returned?.organizationSlug ?? params.org ?? await getKnownLoginOrgSlug();
  const organization = organizationSlug
    ? await prisma.organization.findUnique({ where: { slug: organizationSlug } })
    : null;

  if (!organization || organization.status !== "ACTIVE") notFound();

  const [settings, rewardRules, owner, session] = await Promise.all([
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
    getRequestCustomerSession(),
  ]);

  // سياق جديد في كل عرض: عمره ساعة فلا يبقى رابط انضمام صالحًا بلا حد.
  const state = encodeJoinContext(organization.slug);
  const brandName = settings?.legalName?.trim() || settings?.salonName || organization.name;
  const pointsPerRiyal = settings ? Number(settings.pointsPerCurrencyUnit) : 1;
  const pointsLabel = pointsPerRiyal === 1 ? "نقطة" : `${pointsPerRiyal} نقاط`;

  return (
    <main className="loyalty-join-page relative min-h-screen overflow-hidden bg-salon-onyx text-white">
      <div aria-hidden="true" className="loyalty-ambient loyalty-ambient-top" />
      <div aria-hidden="true" className="loyalty-ambient loyalty-ambient-bottom" />
      <div aria-hidden="true" className="loyalty-grid absolute inset-0 opacity-50" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-7 pt-5 sm:px-7 sm:pb-10 sm:pt-7">
        <nav className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-5" aria-label="هوية برنامج الولاء">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-11 w-11 rounded-xl ring-1 ring-white/10" priority />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-violet-300">إكس مانس إكس XMANSX · LOYALTY</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white/90">{brandName}</p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-3 py-2 text-[11px] font-bold text-emerald-200">
            <Icon name="check" className="h-3.5 w-3.5" />
            مجاني
          </span>
        </nav>

        {/* النموذج أولًا على الجوال. الترتيب المقلوب — عنوان بـ5.4rem وبطاقةُ
            عرضٍ متحركة وشريطُ ثلاث خطوات قبله — كان يجعل من يقف في الصالون
            والحلاق ينتظره يمرّر شاشتين ليجد الزر. الشرح يبقى، لكنه يلي الفعل. */}
        <div className="grid flex-1 items-center gap-9 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] lg:gap-14">
          <section className="order-2 mx-auto w-full max-w-xl lg:order-1 lg:mx-0">
            <h1 className="loyalty-enter loyalty-enter-one text-[clamp(1.75rem,4.5vw,2.75rem)] font-bold leading-[1.15] tracking-tight">
              زيارتك اليوم،
              <span className="loyalty-title-gradient mt-1 block">مكافأتك غدًا.</span>
            </h1>
            <p className="loyalty-enter loyalty-enter-two mt-4 text-sm font-medium leading-7 text-white/58 sm:text-base sm:leading-8">
              سجّل مرة واحدة، واجمع {pointsLabel} مع كل ريال. نقاطك ومكافآتك وحجوزاتك في بطاقة رقمية واحدة.
            </p>

            {/* حقيقتان تخصّان هذا الصالون بالذات — لا بطاقة عرض تمثيلية. */}
            <dl className="loyalty-enter loyalty-enter-three mt-7 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/[0.1] bg-white/[0.04] px-4 py-3.5">
                <dt className="text-[11px] font-semibold text-white/45">معدل الكسب</dt>
                <dd className="mt-1 text-sm font-bold text-white">
                  <span className="text-2xl tabular-nums text-violet-200">{pointsPerRiyal}</span>{" "}
                  {pointsPerRiyal === 1 ? "نقطة" : "نقاط"} / ريال
                </dd>
              </div>
              <div className="rounded-2xl border border-white/[0.1] bg-white/[0.04] px-4 py-3.5">
                <dt className="text-[11px] font-semibold text-white/45">
                  {rewardRules.length > 0 ? "مكافآت متاحة" : "رصيدك"}
                </dt>
                <dd className="mt-1 text-sm font-bold text-white">
                  {rewardRules.length > 0 ? (
                    <>
                      <span className="text-2xl tabular-nums text-violet-200">{rewardRules.length}</span> تبدأ من{" "}
                      {rewardRules[0].requiredPoints} نقطة
                    </>
                  ) : (
                    "يُحفظ تلقائيًا مع كل زيارة"
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <aside className="loyalty-form-shell order-1 mx-auto w-full min-w-0 max-w-lg lg:order-2 lg:mx-0" aria-label="الانضمام لبرنامج الولاء">
            <JoinOrganizationPanel
              state={state}
              brandName={brandName}
              accountName={session?.account.name ?? null}
              controllerEmail={owner?.email ?? null}
              controllerPhone={owner?.phone ?? null}
            />
          </aside>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/[0.07] pt-5 text-[11px] font-medium text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>يعالج الصالون بيانات العضوية وفق إشعار الخصوصية المعروض قبل التسجيل.</p>
          <p>POWERED BY <span className="font-bold text-white/55">إكس مانس إكس XMANSX</span></p>
        </footer>
      </div>
    </main>
  );
}
