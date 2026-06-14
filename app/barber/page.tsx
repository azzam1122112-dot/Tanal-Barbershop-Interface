import { redirect } from "next/navigation";
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
    <main className="min-h-screen bg-[linear-gradient(180deg,#17130f_0%,#24211d_220px,#f6f3ee_221px)] px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-salon-ink">
      <section className="mx-auto max-w-md">
        <div className="sticky top-0 z-10 -mx-4 border-b border-white/10 bg-salon-ink/90 px-4 py-3 text-white backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.18em] text-salon-gold">TANAL BARBER</p>
              <h1 className="mt-1 text-2xl font-black">مرحبًا {session.barber.name}</h1>
            </div>
            <LogoutButton className="border-white/15 bg-white/10 text-white hover:border-salon-gold" />
          </div>
        </div>

        <div className="mt-5 rounded-[1.75rem] border border-white/10 bg-white/10 p-4 text-white shadow-2xl shadow-black/25 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white/70">لوحة العمل السريعة</p>
              <p className="mt-1 text-3xl font-black text-salon-gold">{formatMoney(summary.netTotal)}</p>
              <p className="mt-1 text-xs font-semibold text-white/55">صافي عملياتك اليوم</p>
            </div>
            <div className="rounded-3xl bg-white/10 px-4 py-3 text-center">
              <p className="text-3xl font-black">{summary.visitsCount}</p>
              <p className="text-xs font-bold text-white/65">زيارة</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SummaryTile label="الكاش اليوم" value={formatMoney(summary.cashTotal)} tone="gold" />
            <SummaryTile label="الشبكة اليوم" value={formatMoney(summary.networkTotal)} tone="steel" />
          </div>
        </div>

        <CashSessionPanel initialSession={summary.cashSession} />

        <div className="mt-4 rounded-[1.5rem] border border-salon-line bg-white p-4 shadow-lg shadow-salon-ink/5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">آخر عملياتك اليوم</h2>
            <span className="rounded-full bg-salon-mist px-3 py-1 text-xs font-black text-salon-charcoal">{formatMoney(summary.netTotal)}</span>
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
            {summary.latestVisits.length === 0 ? <p className="rounded-2xl bg-salon-mist py-5 text-center text-sm font-semibold text-salon-charcoal">لا توجد زيارات اليوم بعد</p> : null}
          </div>
        </div>

        {summary.cashSession ? (
          <CustomerSearch />
        ) : (
          <div className="mt-4 rounded-[1.5rem] border border-salon-line bg-white p-5 text-center text-sm font-semibold text-salon-charcoal shadow-lg shadow-salon-ink/5">
            البحث وتسجيل الزيارات يظهران بعد فتح جلسة صندوق.
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "gold" | "steel" }) {
  return (
    <div className={`rounded-3xl border p-3 text-center ${tone === "gold" ? "border-salon-gold/30 bg-salon-gold/15" : "border-white/10 bg-salon-steel/50"}`}>
      <p className="text-xs font-semibold text-white/65">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })}`;
}
