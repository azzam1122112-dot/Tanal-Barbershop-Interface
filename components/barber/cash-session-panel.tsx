"use client";

import { useState } from "react";

type CashSession = {
  id: string;
  openedAt: string;
  visitsCount: number;
  cashTotal: number;
  networkTotal: number;
  netTotal: number;
} | null;

export function CashSessionPanel({ initialSession }: { initialSession: CashSession }) {
  const [cashSession, setCashSession] = useState(initialSession);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function openSession() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/barber/cash-session/open", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as {
      cashSession?: {
        id: string;
        openedAt: string;
        visitsCount: number;
        cashTotal: number;
        cardTotal?: number;
        netTotal: number;
      };
      message?: string;
    };

    if (response.ok && data.cashSession) {
      setCashSession({
        id: data.cashSession.id,
        openedAt: data.cashSession.openedAt,
        visitsCount: data.cashSession.visitsCount,
        cashTotal: data.cashSession.cashTotal,
        networkTotal: data.cashSession.cardTotal ?? 0,
        netTotal: data.cashSession.netTotal,
      });
      setMessage("تم فتح جلسة الصندوق");
      window.location.reload();
    } else {
      setMessage(data.message ?? "تعذر فتح جلسة الصندوق");
    }
    setLoading(false);
  }

  if (!cashSession) {
    return (
      <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-amber-200 bg-[linear-gradient(135deg,#fffaf1_0%,#fff4d6_100%)] shadow-lg shadow-amber-900/5">
        <div className="border-b border-amber-200/70 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-amber-900">لا توجد جلسة صندوق مفتوحة</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">افتح جلسة صندوق قبل البحث وتسجيل الزيارات.</p>
            </div>
            <span className="h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.15)]" />
          </div>
        </div>
        <div className="p-4">
          {message ? <p className="mb-3 rounded-2xl bg-white/70 px-3 py-2 text-sm font-semibold text-amber-900">{message}</p> : null}
        <button
          onClick={openSession}
          disabled={loading}
            className="h-14 w-full rounded-2xl bg-salon-ink px-4 font-black text-white shadow-lg shadow-salon-ink/20 transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? "جاري فتح الجلسة..." : "فتح جلسة صندوق"}
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-emerald-200 bg-white shadow-lg shadow-emerald-950/5">
      <div className="bg-[linear-gradient(135deg,#1f4a3d_0%,#17130f_100%)] p-4 text-white">
        <div className="flex items-start justify-between gap-3">
        <div>
            <p className="text-sm font-black text-salon-gold">جلسة الصندوق مفتوحة</p>
            <p className="mt-1 text-xs font-semibold text-white/75">بدأت: {new Date(cashSession.openedAt).toLocaleString("ar-SA")}</p>
        </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black text-white">{cashSession.visitsCount} زيارة</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        <MiniStat label="كاش الجلسة" value={formatMoney(cashSession.cashTotal)} />
        <MiniStat label="شبكة الجلسة" value={formatMoney(cashSession.networkTotal)} />
        <MiniStat label="الصافي" value={formatMoney(cashSession.netTotal)} />
      </div>
      {message ? <p className="mx-4 mb-4 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{message}</p> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3 text-center">
      <p className="text-[11px] font-semibold text-salon-charcoal/75">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })}`;
}
