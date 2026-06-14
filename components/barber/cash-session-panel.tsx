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
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <p className="text-sm font-bold text-amber-800">لا توجد جلسة صندوق مفتوحة</p>
        <p className="mt-2 text-sm text-amber-800">افتح جلسة صندوق قبل تسجيل الزيارات.</p>
        {message ? <p className="mt-3 text-sm text-amber-900">{message}</p> : null}
        <button
          onClick={openSession}
          disabled={loading}
          className="mt-4 w-full rounded-md bg-salon-ink px-4 py-3 font-bold text-white disabled:opacity-60"
        >
          {loading ? "جاري فتح الجلسة..." : "فتح جلسة صندوق"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-green-800">جلسة الصندوق مفتوحة</p>
          <p className="mt-1 text-xs text-green-800">بدأت: {new Date(cashSession.openedAt).toLocaleString("ar-SA")}</p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-green-700">{cashSession.visitsCount} زيارة</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat label="كاش الجلسة" value={formatMoney(cashSession.cashTotal)} />
        <MiniStat label="شبكة الجلسة" value={formatMoney(cashSession.networkTotal)} />
        <MiniStat label="الصافي" value={formatMoney(cashSession.netTotal)} />
      </div>
      {message ? <p className="mt-3 text-sm text-green-900">{message}</p> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-2 text-center">
      <p className="text-[11px] text-salon-charcoal">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })}`;
}
