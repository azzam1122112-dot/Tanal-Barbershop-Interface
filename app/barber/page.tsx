import { formatAmount as formatMoney } from "@/lib/format";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { LogoutButton } from "@/components/logout-button";
import { CustomerSearch } from "@/components/barber/customer-search";
import { CashSessionPanel } from "@/components/barber/cash-session-panel";
import { getBarberTodaySummary } from "@/lib/barber/barber-summary";
import { prisma } from "@/lib/db/prisma";

export default async function BarberHomePage() {
  const session = await getRequestSession();

  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");
  const summary = await getBarberTodaySummary(prisma, session.barber.id);

  return (
    <main className="barber-shell pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <section className="barber-container">
        <div className="sticky top-0 z-10 -mx-4 border-b border-salon-line bg-salon-mist/95 px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo className="h-12 w-12 border border-salon-line shadow-sm" priority />
              <div className="min-w-0">
                <p className="text-xs font-black text-salon-forest">حلاق تنال</p>
                <h1 className="mt-1 truncate text-2xl font-black text-salon-ink">مرحبًا {session.barber.name}</h1>
              </div>
            </div>
            <LogoutButton className="border-salon-line bg-white text-salon-charcoal shadow-sm hover:border-salon-forest/40" />
          </div>
        </div>

        {summary.cashSession ? <CustomerSearch /> : null}

        <CashSessionPanel initialSession={summary.cashSession} />

        <div className="mt-5 rounded-3xl border border-salon-line bg-white p-5 shadow-sm shadow-salon-ink/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-salon-charcoal/70">لوحة العمل السريعة</p>
              <p className="mt-1 text-4xl font-black text-salon-forest">{formatMoney(summary.netTotal)}</p>
              <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">صافي عملياتك اليوم</p>
            </div>
            <div className="rounded-2xl border border-salon-line bg-salon-mist px-5 py-4 text-center">
              <p className="text-3xl font-black text-salon-ink">{summary.visitsCount}</p>
              <p className="text-xs font-bold text-salon-charcoal/65">زيارة</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SummaryTile label="الكاش اليوم" value={formatMoney(summary.cashTotal)} tone="gold" />
            <SummaryTile label="الشبكة اليوم" value={formatMoney(summary.networkTotal)} tone="steel" />
          </div>
        </div>

        <div className="barber-card mt-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">آخر عملياتك اليوم</h2>
            <span className="rounded-full border border-salon-line bg-salon-pearl px-3 py-1 text-xs font-black text-salon-forest">{formatMoney(summary.netTotal)}</span>
          </div>
          <div className="mt-3 space-y-2">
            {summary.latestVisits.map((visit) => (
              <div key={visit.id} className="rounded-2xl border border-salon-line bg-salon-pearl px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black">{visit.customer.name}</span>
                  <span className="font-black text-salon-forest">{formatMoney(visit.netAmount)}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-salon-charcoal/75">
                  {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"} - {new Date(visit.visitedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
            {summary.latestVisits.length === 0 ? <p className="rounded-2xl border border-dashed border-salon-line bg-salon-pearl py-5 text-center text-sm font-semibold text-salon-charcoal">لا توجد زيارات اليوم بعد</p> : null}
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
      <p className="mt-1 text-lg font-black text-salon-ink">{value}</p>
    </div>
  );
}
