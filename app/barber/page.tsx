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
import { getOpenAttendance } from "@/lib/attendance/attendance-service";
import { listAppointments } from "@/lib/appointments/appointment-service";
import { AttendancePanel } from "@/components/barber/attendance-panel";
import { BarberNotificationCenter } from "@/components/barber/notification-center";
import { prisma } from "@/lib/db/prisma";

export default async function BarberHomePage() {
  const session = await getRequestSession();

  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");
  const [summary, organization, salon] = await Promise.all([
    getBarberTodaySummary(prisma, session.barber.id),
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
                <h1 className="mt-1 truncate text-2xl font-bold text-salon-ink">مرحبًا {session.barber.name}</h1>
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

            {summary.cashSession && !subscription.blockReason ? <CustomerSearch /> : null}

            {upcomingAppointments.length > 0 && !subscription.blockReason ? (
              <div id="appointments" className="barber-card scroll-mt-24 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-bold">مواعيدك اليوم</h2>
                  <span className="rounded-full bg-salon-mist px-3 py-1 text-xs font-bold text-salon-charcoal">
                    {upcomingAppointments.length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {upcomingAppointments.map((appointment) => (
                    <div key={appointment.id} className="rounded-2xl border border-salon-line bg-salon-pearl px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{appointment.customerName}</span>
                        <span className="text-sm font-bold text-salon-forest">
                          {new Date(appointment.startAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-salon-charcoal/75" dir="ltr">
                        {appointment.customerPhone}
                      </p>
                      {appointment.notes ? (
                        <p className="mt-1 text-xs font-semibold text-salon-charcoal/75">{appointment.notes}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {subscription.blockReason ? null : (
              <CashSessionPanel initialSession={summary.cashSession} initialExpenses={sessionExpenses} />
            )}

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
                      {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"} - {new Date(visit.visitedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
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
