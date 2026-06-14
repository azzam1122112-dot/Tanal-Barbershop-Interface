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
    <main className="min-h-screen bg-salon-mist px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-salon-ink">
      <section className="mx-auto max-w-md">
        <div className="sticky top-0 z-10 -mx-4 border-b border-salon-line bg-salon-mist/95 px-4 py-3 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-salon-gold">تطبيق الحلاق</p>
              <h1 className="mt-1 text-2xl font-bold">مرحبًا {session.barber.name}</h1>
            </div>
            <LogoutButton className="bg-white" />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <SummaryTile label="زيارات اليوم" value={summary.visitsCount.toString()} />
          <SummaryTile label="كاش" value={formatMoney(summary.cashTotal)} />
          <SummaryTile label="شبكة" value={formatMoney(summary.networkTotal)} />
        </div>

        <CashSessionPanel initialSession={summary.cashSession} />

        <div className="mt-4 rounded-lg border border-salon-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">آخر عملياتك اليوم</h2>
            <span className="text-xs text-salon-charcoal">{formatMoney(summary.netTotal)}</span>
          </div>
          <div className="mt-3 space-y-2">
            {summary.latestVisits.map((visit) => (
              <div key={visit.id} className="rounded-md bg-salon-mist px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{visit.customer.name}</span>
                  <span>{formatMoney(visit.netAmount)}</span>
                </div>
                <p className="mt-1 text-xs text-salon-charcoal">
                  {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"} - {new Date(visit.visitedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
            {summary.latestVisits.length === 0 ? <p className="py-3 text-center text-sm text-salon-charcoal">لا توجد زيارات اليوم بعد</p> : null}
          </div>
        </div>

        {summary.cashSession ? (
          <CustomerSearch />
        ) : (
          <div className="mt-4 rounded-lg border border-salon-line bg-white p-4 text-center text-sm text-salon-charcoal">
            البحث وتسجيل الزيارات يظهران بعد فتح جلسة صندوق.
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-salon-line bg-white p-3 text-center shadow-sm">
      <p className="text-xs text-salon-charcoal">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })}`;
}
