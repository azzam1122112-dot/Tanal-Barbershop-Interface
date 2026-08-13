import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { DashboardMobileBar } from "@/components/dashboard/dashboard-mobile-bar";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { SalonSwitcher } from "@/components/dashboard/salon-switcher";
import { LogoutButton } from "@/components/logout-button";
import { NoticeRelay } from "@/components/ui/notice-relay";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getSubscriptionState } from "@/lib/plans/subscription-guard";
import { getDashboardRoleCopy } from "@/lib/auth/role-copy";

/**
 * هيكل اللوحة: شريط جانبي + شريط جوال + حالة الاشتراك.
 *
 * سبب وجوده كـ layout لا كمكوّن داخل كل صفحة: التخطيط المشترك لا يُعاد بناؤه
 * عند التنقّل بين مسارات المجموعة، فالجلسة وقائمة الفروع وحالة الاشتراك تُقرأ
 * مرة واحدة عند أول دخول بدل مرة في كل صفحة. صفحة الدخول خارج المجموعة عمدًا
 * لأنها بلا جلسة.
 */
export default async function DashboardShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const role = session.type === "dashboard" ? session.role : null;
  const organizationId = session.type === "dashboard" ? session.organizationId : null;
  const activeSalonId = session.type === "dashboard" ? session.salonId : null;
  // المشرف يرى فروعه المسندة فقط في مبدّل الفروع؛ المالك/المدير يرون كل الفروع.
  const scopedSalonIds = session.type === "dashboard" ? session.scopedSalonIds : null;
  const [salons, organization] = organizationId
    ? await Promise.all([
        prisma.salon.findMany({
          where: { organizationId, isActive: true, ...(scopedSalonIds ? { id: { in: scopedSalonIds } } : {}) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      ])
    : [[], null];
  const roleCopy = getDashboardRoleCopy(role);

  return (
    <main className="dashboard-page">
      <DashboardMobileBar role={role} salons={salons} activeSalonId={activeSalonId} organizationName={organization?.name ?? "المؤسسة"} />
      <div className="mx-auto grid max-w-[1800px] gap-0 lg:grid-cols-[296px_minmax(0,1fr)]">
        <aside className="relative hidden bg-sidebar-onyx text-white shadow-[var(--shadow-sidebar)] lg:sticky lg:top-0 lg:flex lg:min-h-screen lg:flex-col lg:px-5 lg:py-5">
          <span className="pointer-events-none absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-transparent via-salon-gold/40 to-transparent lg:block" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/70 to-transparent" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <BrandLogo className="h-12 w-12 ring-1 ring-salon-gold/30" priority />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-salon-goldlight">إكس مانس إكس XMANSX · {roleCopy.panelEyebrow}</p>
                <p className="mt-1 truncate text-lg font-bold">{roleCopy.panelTitle}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{organization?.name ?? "المؤسسة"}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-white/45">{roleCopy.label}</p>
              </div>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]" aria-label="جلسة نشطة" />
            </div>
            <p className="mt-3 text-xs leading-6 text-white/55">{roleCopy.description}</p>
          </div>

          <div className="mt-4">
            <SalonSwitcher
              salons={salons}
              activeSalonId={activeSalonId}
              allLabel={scopedSalonIds === null ? "كل الفروع" : "الفروع المسندة"}
            />
          </div>

          <div className="mt-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <DashboardNav role={role} />
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-white/40">{roleCopy.sessionLabel}</p>
            <LogoutButton className="mt-3 w-full border-white/15 bg-white/10 text-white hover:bg-white/15" />
          </div>
        </aside>
        {/* الحشو السفلي يحترم منطقة الأمان: بدونه يلامس آخر لوح شريط الصفحة
            الرئيسية في iOS ويصعب الوصول لأزراره. */}
        <section className="min-w-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <SubscriptionBanner organizationId={organizationId} isOwner={role === "OWNER"} />
          {children}
        </section>
        <NoticeRelay />
      </div>
    </main>
  );
}

/**
 * شريط حالة الاشتراك. يظهر فقط عند وجود ما يستحق التنبيه:
 * إيقاف تشغيلي (اشتراك منتهٍ) أو تحذير قرب الانتهاء.
 */
async function SubscriptionBanner({ organizationId, isOwner }: { organizationId: string | null; isOwner: boolean }) {
  if (!organizationId) return null;
  const state = await getSubscriptionState(prisma, organizationId);
  if (!state.blockReason && !state.warning) return null;

  const blocked = Boolean(state.blockReason);

  return (
    <div
      className={`mb-4 flex flex-col gap-3 rounded-xl border px-5 py-4 print:hidden sm:flex-row sm:items-center sm:justify-between ${
        blocked ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold">{blocked ? "التشغيل متوقف" : "تنبيه اشتراك"}</p>
        <p className="mt-1 text-sm font-medium leading-6">{state.blockReason ?? state.warning}</p>
      </div>
      {isOwner ? (
        <Link
          href="/dashboard/subscription"
          className="shrink-0 rounded-lg bg-salon-ink px-4 py-2.5 text-center text-sm font-bold text-white transition hover:bg-salon-charcoal"
        >
          إدارة الباقة
        </Link>
      ) : (
        <span className="shrink-0 text-xs font-semibold opacity-80">راجع مالك المؤسسة</span>
      )}
    </div>
  );
}
