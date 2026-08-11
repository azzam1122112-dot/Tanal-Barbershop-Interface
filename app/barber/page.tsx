import { formatAmount as formatMoney } from "@/lib/format";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { LogoutButton } from "@/components/logout-button";
import { CustomerSearch } from "@/components/barber/customer-search";
import { CashSessionPanel } from "@/components/barber/cash-session-panel";
import { getBarberTodaySummary } from "@/lib/barber/barber-summary";
import { getSubscriptionState } from "@/lib/plans/subscription-guard";
import { getSessionExpenses } from "@/lib/expenses/expense-service";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { getOpenAttendance } from "@/lib/attendance/attendance-service";
import { listAppointments } from "@/lib/appointments/appointment-service";
import { AttendancePanel } from "@/components/barber/attendance-panel";
import { BarberNotificationCenter } from "@/components/barber/notification-center";
import { BarberAppointmentsPanel } from "@/components/barber/appointments-panel";
import { prisma } from "@/lib/db/prisma";
import { getBarberMonthlyCommission } from "@/lib/commissions/barber-monthly-commission";
import { getBarberCommissionBalance } from "@/lib/commissions/commission-payout";
import Link from "next/link";
import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";

export default async function BarberHomePage() {
  const session = await getRequestSession();

  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");
  const [summary, monthlyCommission, commissionBalance, organization, salon] = await Promise.all([
    getBarberTodaySummary(prisma, session.barber.id),
    getBarberMonthlyCommission(prisma, session.barber.id),
    getBarberCommissionBalance(prisma, {
      organizationId: session.organizationId,
      barberId: session.barber.id,
    }),
    session.organizationId
      ? prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true } })
      : null,
    session.salonId
      ? prisma.salon.findUnique({ where: { id: session.salonId }, select: { name: true } })
      : null,
  ]);
  // اسم المؤسسة والفرع قد يتطابقان (مؤسسة بفرع واحد) — تكرارهما يبدو خطأ لا معلومة.
  const workplace = [...new Set([organization?.name, salon?.name].filter(Boolean))].join(" · ");
  const subscription = await getSubscriptionState(prisma, session.organizationId);
  const settings = await getEffectiveSettings(prisma, {
    organizationId: session.organizationId,
    salonId: session.salonId,
  });
  const barberExpenseLimit = settings ? Number(settings.barberExpenseLimit) : 0;
  const [sessionExpenses, openAttendance, todayAppointments] = await Promise.all([
    summary.cashSession ? getSessionExpenses(prisma, summary.cashSession.id) : Promise.resolve([]),
    getOpenAttendance(prisma, session.barber.id),
    listAppointments(prisma, {
      organizationId: session.organizationId,
      salonIds: [session.salonId],
      barberId: session.barber.id,
    }),
  ]);
  const upcomingAppointments = todayAppointments.filter(
    (appointment) => appointment.status === "BOOKED" || appointment.status === "ARRIVED",
  );

  return (
    <main className="barber-shell">
      <section className="barber-container">
        <div className="sticky top-0 z-10 -mx-4 border-b border-salon-line bg-salon-mist/95 px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo className="h-12 w-12 border border-salon-line shadow-sm" priority />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-salon-forest">{workplace || "منصة XMANSX"}</p>
                {/* الاسم يلتف على سطرين بدل أن يُقصّ: «مرحبًا حلاق تجر…» ليست تحية. */}
                <h1 className="mt-1 text-xl font-bold leading-tight text-salon-ink sm:text-2xl">
                  مرحبًا {session.barber.name}
                </h1>
              </div>
            </div>
            <LogoutButton className="border-salon-line bg-white text-salon-charcoal shadow-sm hover:border-salon-forest/40" />
          </div>
        </div>

        {subscription.blockReason ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-900">
            <p className="text-base font-bold">التشغيل متوقف مؤقتًا</p>
            <p className="mt-1.5 text-sm font-semibold leading-6">{subscription.blockReason}</p>
            <p className="mt-2 text-xs font-bold">راجع مدير الصالون لتفعيل الاشتراك.</p>
          </div>
        ) : null}

        {subscription.warning ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {subscription.warning}
          </div>
        ) : null}

        {/* عمودان من التابلت فما فوق: ما يُعمل به يمينًا (حضور، بحث، مواعيد)،
            وما يُراقَب يسارًا (الصندوق، الملخص، آخر العمليات). */}
        <div className="barber-grid mt-4">
          <div className="space-y-4">
            {subscription.blockReason ? null : (
              <AttendancePanel
                initialAttendance={
                  openAttendance
                    ? { id: openAttendance.id, checkInAt: openAttendance.checkInAt.toISOString(), isOpen: true }
                    : null
                }
              />
            )}

            {subscription.blockReason ? null : <BarberNotificationCenter />}

            {/* بلا جلسة صندوق تبقى البطاقة ظاهرة معطّلة بسببها: إخفاؤها كان
                يقرأ كعطل في التطبيق لا كقاعدة تشغيلية. */}
            {subscription.blockReason ? null : summary.cashSession ? (
              <>
                <section className="barber-card lux-edge overflow-hidden p-5">
                  <p className="lux-eyebrow">نقطة البيع</p>
                  <h2 className="mt-2 text-2xl font-bold text-salon-ink">سجّل الخدمة أولًا</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal/70">
                    بيانات العميل اختيارية. اربط عضو الولاء قبل الدفع أو أكمل كزائر بلا أي بيانات شخصية.
                  </p>
                  <Link href="/barber/visits/new" className="barber-gold-button mt-5 flex h-16 items-center justify-center text-xl">
                    + عملية جديدة
                  </Link>
                </section>
                <CustomerSearch />
              </>
            ) : (
              <section className="barber-card overflow-hidden p-5">
                <p className="lux-eyebrow">نقطة البيع</p>
                <h2 className="mt-2 text-2xl font-bold text-salon-ink">افتح جلسة الصندوق لتبدأ</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal/70">
                  تسجيل الزيارات والبحث عن العملاء يحتاجان جلسة صندوق مفتوحة، حتى يبقى كل مبلغ مربوطًا
                  بدرج معروف. افتحها من بطاقة «جلسة الصندوق» في هذه الصفحة.
                </p>
                <button
                  type="button"
                  disabled
                  className="barber-gold-button mt-5 flex h-16 w-full items-center justify-center text-xl"
                >
                  + عملية جديدة
                </button>
                <p className="mt-2 text-center text-xs font-bold text-salon-ruby">متوقّف حتى تفتح جلسة صندوق</p>
              </section>
            )}

            {!subscription.blockReason ? (
              <BarberAppointmentsPanel
                initialAppointments={upcomingAppointments}
                barberName={session.barber.name}
                salonName={salon?.name ?? organization?.name}
              />
            ) : null}
          </div>

          <div className="space-y-4">
            {subscription.blockReason ? null : (
              <CashSessionPanel
                initialSession={summary.cashSession}
                initialExpenses={sessionExpenses}
                custodyBalance={summary.custodyBalance}
                custodyInitialized={summary.custodyInitialized}
                collections={summary.collections}
                expenseLimit={barberExpenseLimit}
              />
            )}

            {monthlyCommission ? (
              <section className="relative overflow-hidden rounded-3xl border border-salon-gold/40 bg-gradient-to-br from-salon-ink via-salon-forest to-salon-ink p-5 text-white shadow-lg">
                <div aria-hidden="true" className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-salon-gold/20 blur-2xl" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black tracking-wide text-salon-gold">مستحقات العمولة</p>
                      <h2 className="mt-1 text-lg font-bold">عمولة {monthlyCommission.monthLabel}</h2>
                    </div>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold">مفعّلة</span>
                  </div>
                  {/* الرقم البطولي هو المتبقي له لا ما اكتسبه: بعد أول صرف يصير
                      المكتسب الخام رقمًا مضلّلًا يظن الحلاق أنه ما زال يستحقه. */}
                  <p className="lux-number mt-5 text-4xl text-white">{formatMoney(commissionBalance.outstanding)}</p>
                  <p className="mt-1 text-xs font-semibold text-white/65">
                    المتبقي لك بعد ما استلمته · عمولة {monthlyCommission.monthLabel} {formatMoney(monthlyCommission.commissionAmount)}
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4 text-center">
                    <div className="rounded-xl bg-white/10 px-2 py-2.5">
                      <p className="lux-number text-base">{formatMoney(commissionBalance.accrued)}</p>
                      <p className="text-[11px] font-bold text-white/65">مستحق تراكمي</p>
                    </div>
                    <div className="rounded-xl bg-white/10 px-2 py-2.5">
                      <p className="lux-number text-base">{formatMoney(commissionBalance.paid)}</p>
                      <p className="text-[11px] font-bold text-white/65">استلمته</p>
                    </div>
                    <div className="rounded-xl bg-white/10 px-2 py-2.5">
                      <p className="lux-number text-base">{monthlyCommission.effectiveRate}%</p>
                      <p className="text-[11px] font-bold text-white/65">النسبة الفعلية</p>
                    </div>
                  </div>
                  {commissionBalance.payouts.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {commissionBalance.payouts.slice(0, 3).map((payout) => (
                        <li
                          key={payout.id}
                          className="flex items-baseline justify-between gap-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/85"
                        >
                          <span className="min-w-0 truncate">
                            {new Date(payout.paidAt).toLocaleDateString("ar-SA", { timeZone: RIYADH_TIME_ZONE })} ·{" "}
                            {payout.methodLabel}
                            {payout.paidByName ? ` · ${payout.paidByName}` : ""}
                          </span>
                          <span className="lux-number shrink-0 text-salon-goldlight">{formatMoney(payout.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-white/20 px-3 py-2.5 text-center text-[11px] font-semibold text-white/60">
                      لم تستلم أي صرف عمولة بعد. كل صرف توثّقه الإدارة سيظهر هنا بمبلغه وطريقته.
                    </p>
                  )}
                </div>
              </section>
            ) : null}

            <div className="barber-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-salon-charcoal/70">لوحة العمل السريعة</p>
                  <p className="mt-1 text-4xl font-black tabular-nums text-salon-forest">{formatMoney(summary.netTotal)}</p>
                  <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">صافي عملياتك اليوم</p>
                </div>
                <div className="shrink-0 rounded-2xl border border-salon-line bg-salon-mist px-5 py-4 text-center">
                  <p className="text-3xl font-black tabular-nums text-salon-ink">{summary.visitsCount}</p>
                  <p className="text-xs font-bold text-salon-charcoal/65">زيارة</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <SummaryTile label="الكاش اليوم" value={formatMoney(summary.cashTotal)} tone="gold" />
                <SummaryTile label="الشبكة اليوم" value={formatMoney(summary.networkTotal)} tone="steel" />
              </div>
            </div>

            <div className="barber-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold">آخر عملياتك اليوم</h2>
                <span className="rounded-full border border-salon-line bg-salon-pearl px-3 py-1 text-xs font-black tabular-nums text-salon-forest">{formatMoney(summary.netTotal)}</span>
              </div>
              <div className="mt-3 space-y-2">
                {summary.latestVisits.map((visit) => (
                  <div key={visit.id} className="rounded-2xl border border-salon-line bg-salon-pearl px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">{visit.customer.name}</span>
                      <span className="font-black tabular-nums text-salon-forest">{formatMoney(visit.netAmount)}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal/75">
                      {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"} - {new Date(visit.visitedAt).toLocaleTimeString("ar-SA", { timeZone: RIYADH_TIME_ZONE, hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
                {summary.latestVisits.length === 0 ? <p className="rounded-2xl border border-dashed border-salon-line bg-salon-pearl py-5 text-center text-sm font-semibold text-salon-charcoal">لا توجد زيارات اليوم بعد</p> : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "gold" | "steel" }) {
  return (
    <div className={`rounded-2xl border p-3 text-center ${tone === "gold" ? "border-salon-gold/40 bg-salon-gold/15" : "border-salon-steel/25 bg-salon-steel/10"}`}>
      <p className="text-xs font-semibold text-salon-charcoal/70">{label}</p>
      <p className="mt-1 text-lg font-bold text-salon-ink">{value}</p>
    </div>
  );
}
