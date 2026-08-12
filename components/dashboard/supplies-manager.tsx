"use client";

import { FormEvent, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/dashboard/ui";

/**
 * إدارة المستلزمات التشغيلية.
 *
 * **بلا أي حقل مالي عمدًا:** لا سعر ولا تكلفة ولا كمية. الشاشة تجيب سؤالًا
 * واحدًا: ما الذي يحتاج توريدًا الآن ومنذ متى؟ الشراء نفسه يُسجَّل مصروفًا في
 * شاشة المصروفات كما هو، فلا يُحتسب شيء مرتين.
 */

export type SupplyItemRow = {
  id: string;
  name: string;
  unit: string | null;
  status: "AVAILABLE" | "LOW" | "OUT";
  statusLabel: string;
  isActive: boolean;
  salon: { id: string; name: string };
  lastReportedAt: string | null;
  lastRestockedAt: string | null;
  openReport: {
    id: string;
    status: string;
    statusLabel: string;
    note: string | null;
    createdAt: string;
    barberName: string;
    escalatedByName: string | null;
  } | null;
};

export function SuppliesManager({
  initialItems,
  salons,
  defaultSalonId,
}: {
  initialItems: SupplyItemRow[];
  salons: { id: string; name: string }[];
  defaultSalonId: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const needsRestock = items.filter((item) => item.isActive && item.status !== "AVAILABLE");

  async function reload() {
    const response = await fetch("/api/dashboard/supplies", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { items?: SupplyItemRow[] };
    if (response.ok && data.items) setItems(data.items);
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setToast(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    const response = await fetch("/api/dashboard/supplies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonId: form.get("salonId"),
        name: form.get("name"),
        unit: form.get("unit") || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (response.ok) {
      formEl.reset();
      await reload();
      setToast({ message: "تمت إضافة الصنف", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إضافة الصنف", tone: "error" });
    }
    setCreating(false);
  }

  async function resolve(item: SupplyItemRow, decision: "RESTOCKED" | "DISMISS") {
    if (!item.openReport) return;
    const accepted = await confirm({
      title: decision === "RESTOCKED" ? "تأكيد التوريد؟" : "تجاهل البلاغ؟",
      description:
        decision === "RESTOCKED"
          ? `سيعود ${item.name} إلى «متوفر» ويُقفل البلاغ، ويرى الحلاقون الحالة الجديدة فورًا.`
          : `سيُقفل البلاغ دون تغيير الحالة — يبقى ${item.name} ناقصًا حتى يورَّد فعلًا.`,
      confirmLabel: decision === "RESTOCKED" ? "تم التوريد" : "تجاهل",
      tone: decision === "RESTOCKED" ? "default" : "danger",
    });
    if (!accepted) return;

    setPendingId(item.id);
    setToast(null);
    const response = await fetch(`/api/dashboard/supply-reports/${item.openReport.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (response.ok) {
      await reload();
      setToast({
        message: decision === "RESTOCKED" ? "سُجّل التوريد" : "أُقفل البلاغ",
        tone: "success",
      });
    } else {
      setToast({ message: data.message ?? "تعذر معالجة البلاغ", tone: "error" });
    }
    setPendingId(null);
  }

  return (
    <div className="mt-6 space-y-4">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      {confirmDialog}

      {needsRestock.length > 0 ? (
        <section className="dashboard-panel border-amber-300/60 p-5">
          <h2 className="lux-section-title">يحتاج توريدًا الآن</h2>
          <p className="dashboard-muted mt-1 text-sm">
            بلاغات حلاقي الفروع. «تم التوريد» يعيد الصنف متوفرًا ويُخطر الفرع فورًا.
          </p>
          <ul className="mt-4 space-y-2">
            {needsRestock.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-salon-ink">
                    {item.name}
                    {item.unit ? <span className="mr-1.5 text-xs font-semibold text-salon-charcoal/60">/ {item.unit}</span> : null}
                    <span
                      className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        item.status === "OUT" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {item.statusLabel}
                    </span>
                  </p>
                  {item.openReport ? (
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">
                      {item.salon.name} · بلّغ {item.openReport.barberName} ·{" "}
                      {formatDateTime(item.openReport.createdAt)}
                      {item.openReport.escalatedByName ? ` · رفعها ${item.openReport.escalatedByName}` : ""}
                      {item.openReport.note ? ` · «${item.openReport.note}»` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void resolve(item, "RESTOCKED")}
                    className="dashboard-button px-4 py-2 text-xs disabled:opacity-50"
                  >
                    {pendingId === item.id ? "..." : "تم التوريد"}
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void resolve(item, "DISMISS")}
                    className="dashboard-button-soft px-4 py-2 text-xs disabled:opacity-50"
                  >
                    تجاهل
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="dashboard-panel p-5">
        <h2 className="lux-section-title">أصناف المستلزمات</h2>
        <p className="dashboard-muted mt-1 text-sm">
          ما يُستهلك في العمل ولا يُباع للعميل. بلا سعر ولا كمية — الشراء يُسجَّل في المصروفات كما هو.
        </p>

        <form onSubmit={addItem} className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_160px_120px]">
          <label className="text-sm font-bold text-salon-charcoal">
            اسم الصنف
            <input name="name" required minLength={2} maxLength={80} placeholder="أمواس حلاقة" className="dashboard-field mt-2" />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            الوحدة
            <input name="unit" maxLength={20} placeholder="علبة" className="dashboard-field mt-2" />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            الفرع
            <select name="salonId" defaultValue={defaultSalonId ?? ""} className="dashboard-field mt-2">
              {salons.map((salon) => (
                <option key={salon.id} value={salon.id}>
                  {salon.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={creating} className="dashboard-button mt-auto py-3">
            {creating ? "..." : "إضافة"}
          </button>
        </form>

        {items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="لا توجد مستلزمات بعد"
              description="أضف ما يستهلكه الفرع — أمواس، رغوة، مناشف — ليتمكن الحلاقون من الإبلاغ عن نفادها."
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-salon-line">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-salon-ink">
                    {item.name}
                    {item.unit ? <span className="mr-1.5 text-xs font-semibold text-salon-charcoal/60">/ {item.unit}</span> : null}
                    {!item.isActive ? (
                      <span className="mr-2 text-xs font-semibold text-salon-charcoal/55">(معطل)</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/65">
                    {item.salon.name}
                    {item.lastRestockedAt ? ` · آخر توريد ${formatDateTime(item.lastRestockedAt)}` : " · لم يُسجَّل توريد بعد"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    item.status === "OUT"
                      ? "bg-red-50 text-red-700"
                      : item.status === "LOW"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {item.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
