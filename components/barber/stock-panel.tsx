"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

/**
 * مخزون الفرع في يد الحلاق.
 *
 * **يرى ولا يخصم:** الحلاق أول من يرى الرفّ فارغًا، لكن خصمًا مباشرًا بيده
 * يعني إخراج بضاعة بلا رقابة. فيبلّغ هنا، وتعتمده الإدارة فتنشأ حركة موثقة.
 *
 * والمنتج الذي نفد يبقى **ظاهرًا** في هذه القائمة بخلاف قائمة البيع التي تخفيه:
 * «لماذا اختفى المنتج؟» سؤال يُهدر وقت الحلاق، و«نفد» جوابٌ في كلمة.
 */

export type BarberStockProduct = {
  id: string;
  name: string;
  stockQuantity: number;
  lowStockThreshold: number;
};

export type BarberStockReport = {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  quantity: number | null;
  createdAt: string;
  product: { id: string; name: string };
};

const REPORT_TYPES = [
  { value: "LOW_STOCK", label: "قارب على النفاد", needsQuantity: false },
  { value: "DAMAGED", label: "تالف", needsQuantity: true },
  { value: "MISSING", label: "مفقود", needsQuantity: true },
] as const;

export function BarberStockPanel({
  products,
  initialReports,
}: {
  products: BarberStockProduct[];
  initialReports: BarberStockReport[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [type, setType] = useState<string>("LOW_STOCK");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const openProduct = products.find((product) => product.id === openProductId) ?? null;
  const needsQuantity = REPORT_TYPES.find((item) => item.value === type)?.needsQuantity ?? false;
  const openReports = reports.filter((report) => report.status === "OPEN");
  const lowCount = products.filter(
    (product) => product.stockQuantity <= product.lowStockThreshold,
  ).length;

  function startReport(product: BarberStockProduct) {
    setOpenProductId(product.id);
    setType(product.stockQuantity <= 0 ? "MISSING" : "LOW_STOCK");
    setQuantity("1");
    setNote("");
    setToast(null);
  }

  async function submitReport() {
    if (!openProduct) return;
    setPending(true);
    setToast(null);

    const response = await fetch("/api/barber/stock-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: openProduct.id,
        type,
        quantity: needsQuantity ? Number(quantity) : undefined,
        note: note.trim() || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      report?: BarberStockReport;
      message?: string;
    };

    if (response.ok && data.report) {
      setReports((current) => [data.report!, ...current.filter((row) => row.id !== data.report!.id)]);
      setOpenProductId(null);
      setToast({ message: "وصل بلاغك للإدارة. ستراه معتمدًا أو مرفوضًا هنا.", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إرسال البلاغ", tone: "error" });
    }
    setPending(false);
  }

  return (
    <section className="barber-card overflow-hidden">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <div className="barber-card-head flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold text-salon-ink">مخزون الفرع</h2>
          <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">
            {lowCount > 0 ? `${formatNumber(lowCount)} منتج يحتاج انتباهًا` : "الكميات كافية"}
          </p>
        </div>
        {openReports.length > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
            {formatNumber(openReports.length)} بلاغ معلّق
          </span>
        ) : null}
      </div>

      {products.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm font-semibold text-salon-charcoal/70">
          لا توجد منتجات مسجّلة في فرعك.
        </p>
      ) : (
        <ul className="divide-y divide-salon-line/70">
          {products.map((product) => {
            const out = product.stockQuantity <= 0;
            const low = !out && product.stockQuantity <= product.lowStockThreshold;
            const reported = openReports.find((report) => report.product.id === product.id);

            return (
              <li key={product.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-salon-ink">{product.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/65">
                      المتوفر <span className="lux-number">{formatNumber(product.stockQuantity)}</span>
                      {reported ? ` · بلاغ ${reported.typeLabel} قيد المراجعة` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {out ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 ring-1 ring-red-200">
                        نفد
                      </span>
                    ) : low ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                        قارب على النفاد
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startReport(product)}
                      className="min-h-11 rounded-xl border border-salon-line bg-white px-3 text-xs font-bold text-salon-charcoal transition active:scale-95 disabled:opacity-55"
                    >
                      بلّغ
                    </button>
                  </div>
                </div>

                {openProductId === product.id ? (
                  <div className="mt-3 rounded-2xl border border-salon-line bg-salon-pearl p-3">
                    <label className="block text-xs font-bold text-salon-charcoal">
                      نوع البلاغ
                      <select
                        value={type}
                        onChange={(event) => setType(event.target.value)}
                        className="barber-field mt-2 h-12"
                      >
                        {REPORT_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {needsQuantity ? (
                      <label className="mt-2 block text-xs font-bold text-salon-charcoal">
                        الكمية
                        <input
                          lang="en"
                          dir="ltr"
                          type="number"
                          min={1}
                          max={product.stockQuantity}
                          step={1}
                          inputMode="numeric"
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                          className="barber-field mt-2 h-12 text-center"
                        />
                        <span className="mt-1 block text-[11px] font-semibold text-salon-charcoal/60">
                          المسجَّل في النظام {formatNumber(product.stockQuantity)}.
                        </span>
                      </label>
                    ) : null}

                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={200}
                      placeholder="ملاحظة (اختياري)"
                      className="barber-field mt-2 h-12"
                    />

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void submitReport()}
                        className="barber-primary-button h-12"
                      >
                        {pending ? "جاري الإرسال..." : "إرسال البلاغ"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setOpenProductId(null)}
                        className="barber-ghost-button h-12"
                      >
                        إلغاء
                      </button>
                    </div>
                    <p className="mt-2 text-center text-[11px] font-semibold text-salon-charcoal/60">
                      البلاغ لا يخصم من المخزون — تعتمده الإدارة أولًا.
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {reports.length > 0 ? (
        <div className="border-t border-salon-line/70 px-4 py-3">
          <p className="text-xs font-bold text-salon-charcoal/75">آخر بلاغاتك</p>
          <ul className="mt-2 space-y-1.5">
            {reports.slice(0, 4).map((report) => (
              <li
                key={report.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-salon-pearl px-3 py-2 text-xs font-semibold"
              >
                <span className="min-w-0 truncate">
                  {report.product.name} · {report.typeLabel}
                  {report.quantity ? ` (${formatNumber(report.quantity)})` : ""}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    report.status === "OPEN"
                      ? "bg-amber-50 text-amber-800"
                      : report.status === "RESOLVED"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-salon-mist text-salon-charcoal/70"
                  }`}
                >
                  {report.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
