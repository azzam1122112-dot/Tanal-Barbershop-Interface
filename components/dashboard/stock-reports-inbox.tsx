"use client";

import { useState } from "react";
import { formatDateTime, formatNumber } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge, EmptyState } from "@/components/dashboard/ui";
/**
 * بلاغات الحلاقين عن المخزون.
 *
 * الاعتماد ليس زرًّا شكليًا: بلاغ التالف أو المفقود يُنشئ حركة `WASTE` تخصم
 * الكمية باسم من اعتمدها، فيبقى القرار مربوطًا بأثره في دفتر المخزون. أما
 * «قارب على النفاد» فتنبيه لا نقص وقع، ولا حركة له.
 */

export type StockReportRow = {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  quantity: number | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  product: { id: string; name: string; stockQuantity: number };
  barber: { id: string; name: string };
  salon: { id: string; name: string };
  resolvedBy: { id: string; name: string } | null;
};

export function StockReportsInbox({ initialReports }: { initialReports: StockReportRow[] }) {
  const [reports, setReports] = useState(initialReports);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const open = reports.filter((report) => report.status === "OPEN");
  const handled = reports.filter((report) => report.status !== "OPEN");

  async function resolve(report: StockReportRow, decision: "APPROVE" | "DISMISS") {
    const deducts = decision === "APPROVE" && report.type !== "LOW_STOCK";
    const accepted = await confirm({
      title: decision === "APPROVE" ? "اعتماد البلاغ؟" : "رفض البلاغ؟",
      description: deducts
        ? `سيُخصم ${formatNumber(report.quantity ?? 0)} من ${report.product.name} بحركة «تالف» موثقة باسمك، ويصبح الرصيد ${formatNumber(
            report.product.stockQuantity - (report.quantity ?? 0),
          )}.`
        : decision === "APPROVE"
          ? "سيُعلَّم البلاغ معتمدًا بلا أي خصم — تنبيه قرب النفاد لا يغيّر الكمية."
          : "سيُعلَّم البلاغ مرفوضًا ويبقى في السجل مع سبب الرفض.",
      confirmLabel: decision === "APPROVE" ? "اعتماد" : "رفض",
      tone: decision === "APPROVE" ? "default" : "danger",
    });
    if (!accepted) return;

    const note =
      decision === "DISMISS"
        ? window.prompt(`سبب رفض بلاغ ${report.product.name}؟ (اختياري)`) ?? undefined
        : undefined;

    setPendingId(report.id);
    setToast(null);
    const response = await safeFetch(`/api/dashboard/stock-reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    const data = (await response.json().catch(() => ({}))) as { report?: StockReportRow; message?: string };

    if (response.ok && data.report) {
      setReports((current) => current.map((row) => (row.id === report.id ? data.report! : row)));
      setToast({
        message: decision === "APPROVE" ? "تم اعتماد البلاغ" : "تم رفض البلاغ",
        tone: "success",
      });
    } else {
      setToast({ message: data.message ?? "تعذر معالجة البلاغ", tone: "error" });
    }
    setPendingId(null);
  }

  return (
    <section className="dashboard-panel mt-6 p-5">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      {confirmDialog}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="lux-section-title">بلاغات الحلاقين</h2>
          <p className="dashboard-muted mt-1 text-sm">
            ما يراه من يقف أمام الرفّ. الاعتماد ينشئ حركة مخزون موثقة باسمك؛ البلاغ وحده لا يخصم شيئًا.
          </p>
        </div>
        {open.length > 0 ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
            {formatNumber(open.length)} بانتظارك
          </span>
        ) : null}
      </div>

      {reports.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="لا توجد بلاغات"
            description="سيظهر هنا كل بلاغ يرسله حلاق عن نقص أو تالف أو مفقود."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {[...open, ...handled].map((report) => {
            const busy = pendingId === report.id;
            return (
              <li
                key={report.id}
                className={`rounded-xl border px-4 py-3 ${
                  report.status === "OPEN" ? "border-amber-200 bg-amber-50/40" : "border-salon-line bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-salon-ink">
                      {report.product.name}
                      <span className="mr-2 text-xs font-semibold text-salon-charcoal/70">
                        {report.typeLabel}
                        {report.quantity ? ` · ${formatNumber(report.quantity)}` : ""}
                      </span>
                      {report.status === "RESOLVED" ? <Badge tone="success">معتمد</Badge> : null}
                      {report.status === "DISMISSED" ? <Badge tone="danger">مرفوض</Badge> : null}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal/65">
                      {report.barber.name} · {report.salon.name} · {formatDateTime(report.createdAt)} · الرصيد
                      الحالي {formatNumber(report.product.stockQuantity)}
                    </p>
                    {report.note ? (
                      <p className="mt-1 text-xs font-semibold text-salon-charcoal">«{report.note}»</p>
                    ) : null}
                    {report.status !== "OPEN" ? (
                      <p className="mt-1 text-[11px] font-semibold text-salon-charcoal/60">
                        {report.resolvedBy ? `${report.resolvedBy.name} · ` : ""}
                        {report.resolvedAt ? formatDateTime(report.resolvedAt) : ""}
                        {report.resolutionNote ? ` · ${report.resolutionNote}` : ""}
                      </p>
                    ) : null}
                  </div>

                  {report.status === "OPEN" ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolve(report, "APPROVE")}
                        className="dashboard-button px-4 py-2 text-xs disabled:opacity-50"
                      >
                        {busy ? "..." : "اعتماد"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolve(report, "DISMISS")}
                        className="dashboard-button-soft px-4 py-2 text-xs disabled:opacity-50"
                      >
                        رفض
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
