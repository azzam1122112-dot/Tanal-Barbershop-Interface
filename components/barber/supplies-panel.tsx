"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
/**
 * مستلزمات الفرع في يد الحلاق.
 *
 * **البلاغ حالة فرع لا حالة حلاق:** أول من يبلّغ يفتح البلاغ، ويرى بقية
 * الحلاقين فورًا «بلّغ عنها فلان» فلا تصل الإدارة عشر رسائل عن علبة واحدة.
 * ولمن وجدها نفدت فعلًا بعد بلاغ «قاربت» يبقى زرّ واحد يرفع الحالة.
 *
 * ولا رقم هنا ولا سعر: هذه قناة تشغيلية بحتة لا تمسّ أي عملية مالية.
 */

export type SupplyItemView = {
  id: string;
  name: string;
  unit: string | null;
  status: "AVAILABLE" | "LOW" | "OUT";
  statusLabel: string;
  lastRestockedAt: string | null;
  openReport: {
    id: string;
    status: "AVAILABLE" | "LOW" | "OUT";
    statusLabel: string;
    note: string | null;
    createdAt: string;
    barberName: string;
    escalatedByName: string | null;
  } | null;
};

const SEVERITY: Record<SupplyItemView["status"], number> = { AVAILABLE: 0, LOW: 1, OUT: 2 };

export function BarberSuppliesPanel({ initialItems }: { initialItems: SupplyItemView[] }) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  // زميل في الفرع قد يبلّغ من جهازه: التحديث الدوري يمنع بلاغًا مكرّرًا يُرفض.
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden" || pendingId) return;
    try {
      const response = await safeFetch("/api/barber/supplies", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { items?: SupplyItemView[] };
      if (response.ok && data.items) setItems(data.items);
    } catch {
      // التحديث التالي يعيد المحاولة بلا إزعاج.
    }
  }, [pendingId]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  async function report(item: SupplyItemView, status: "LOW" | "OUT") {
    setPendingId(item.id);
    setToast(null);
    const response = await safeFetch("/api/barber/supplies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, status }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      escalated?: boolean;
      alreadyOpen?: boolean;
      message?: string;
    };

    if (response.ok) {
      await refresh();
      setToast({
        message: data.escalated
          ? `تم رفع حالة ${item.name} إلى «نفد» وإبلاغ الإدارة.`
          : data.alreadyOpen
            ? `${item.name} مُبلَّغ عنها مسبقًا — الإدارة تعرف.`
            : `وصل بلاغ ${item.name} للإدارة.`,
        tone: "success",
      });
    } else {
      setToast({ message: data.message ?? "تعذر إرسال البلاغ", tone: "error" });
    }
    setPendingId(null);
  }

  const needsAttention = items.filter((item) => item.status !== "AVAILABLE").length;

  return (
    <section className="barber-card overflow-hidden">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <div className="barber-card-head flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold text-salon-ink">مستلزمات الفرع</h2>
          <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">
            أمواس ورغوة وما يُستهلك في العمل — بلاغك يصل الإدارة ويراه زملاؤك
          </p>
        </div>
        {needsAttention > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
            {needsAttention} يحتاج توريدًا
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm font-semibold text-salon-charcoal/70">
          لم تُسجَّل مستلزمات لفرعك بعد. اطلب من الإدارة إضافتها لتتمكن من الإبلاغ عنها.
        </p>
      ) : (
        <ul className="divide-y divide-salon-line/70">
          {items.map((item) => {
            const busy = pendingId === item.id;
            const open = item.openReport;
            const canEscalate = open ? SEVERITY[open.status] < SEVERITY.OUT : false;

            return (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-salon-ink">
                      {item.name}
                      {item.unit ? (
                        <span className="mr-1.5 text-xs font-semibold text-salon-charcoal/55">/ {item.unit}</span>
                      ) : null}
                    </p>
                    {open ? (
                      <p className="mt-0.5 text-xs font-semibold text-amber-800">
                        بلّغ عنها {open.barberName} · {formatDateTime(open.createdAt)}
                        {open.escalatedByName ? ` · رفعها ${open.escalatedByName}` : ""}
                      </p>
                    ) : item.lastRestockedAt ? (
                      <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/60">
                        آخر توريد {formatDateTime(item.lastRestockedAt)}
                      </p>
                    ) : null}
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                      item.status === "OUT"
                        ? "bg-red-50 text-red-700 ring-red-200"
                        : item.status === "LOW"
                          ? "bg-amber-50 text-amber-800 ring-amber-200"
                          : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    }`}
                  >
                    {item.statusLabel}
                  </span>
                </div>

                {/* زرّ واحد بضغطة واحدة: الحلاق واقف عند الكرسي لا أمام نموذج. */}
                {open ? (
                  canEscalate ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void report(item, "OUT")}
                      className="mt-3 min-h-11 w-full rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition active:scale-[0.99] disabled:opacity-55"
                    >
                      {busy ? "..." : "نفدت تمامًا — ارفع البلاغ"}
                    </button>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-salon-line bg-salon-pearl px-3 py-2.5 text-center text-[11px] font-bold text-salon-charcoal/70">
                      بانتظار توريد الإدارة — لا حاجة لبلاغ آخر
                    </p>
                  )
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void report(item, "LOW")}
                      className="min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-800 transition active:scale-[0.98] disabled:opacity-55"
                    >
                      قاربت على النفاد
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void report(item, "OUT")}
                      className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition active:scale-[0.98] disabled:opacity-55"
                    >
                      نفدت
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
