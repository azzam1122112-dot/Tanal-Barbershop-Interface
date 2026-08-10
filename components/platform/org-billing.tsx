"use client";

import { FormEvent, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Invoice = {
  id: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
  providerLabel: string;
  amount: number;
  periodMonths: number;
  reference: string | null;
  note: string | null;
  planName: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

type PlanOption = { id: string; name: string; priceMonthly: number; priceYearly: number | null };

/**
 * تسجيل دفعات الاشتراك المحصّلة يدويًا (تحويل بنكي/نقدًا).
 * الدفعة تجدّد الاشتراك فورًا وتُسجَّل كفاتورة قابلة للمراجعة.
 */
export function OrgBilling({
  organizationId,
  currentPlanId,
  plans,
  initialInvoices,
  currentPeriodEnd,
}: {
  organizationId: string;
  currentPlanId: string | null;
  plans: PlanOption[];
  initialInvoices: Invoice[];
  currentPeriodEnd: string | null;
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? "");
  const [months, setMonths] = useState(1);
  const { confirm, confirmDialog } = useConfirm();

  const selectedPlan = plans.find((plan) => plan.id === planId);
  const suggestedAmount = selectedPlan
    ? months % 12 === 0 && selectedPlan.priceYearly !== null
      ? selectedPlan.priceYearly * (months / 12)
      : selectedPlan.priceMonthly * months
    : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    const response = await fetch(`/api/platform/organizations/${organizationId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: planId || null,
        amount: form.get("amount"),
        periodMonths: months,
        provider: form.get("provider"),
        reference: form.get("reference") || null,
        note: form.get("note") || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { invoice?: Invoice; message?: string };

    if (response.ok && data.invoice) {
      setInvoices((current) => [data.invoice!, ...current]);
      formEl.reset();
      setMessage({ text: `تم تجديد الاشتراك حتى ${formatDate(data.invoice.periodEnd)}`, tone: "success" });
    } else {
      setMessage({ text: data.message ?? "تعذر تسجيل الدفعة", tone: "error" });
    }
    setLoading(false);
  }

  async function voidInvoice(invoice: Invoice) {
    const confirmed = await confirm({
      title: "إلغاء هذه الدفعة؟",
      description: "ستُعاد نهاية فترة الاشتراك للحساب حسب آخر دفعة مدفوعة متبقية.",
      confirmLabel: "إلغاء الدفعة",
      tone: "danger",
    });
    if (!confirmed) return;

    setPendingId(invoice.id);
    setMessage(null);
    const response = await fetch(`/api/platform/organizations/${organizationId}/payments/${invoice.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "تصحيح إدخال" }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (response.ok) {
      setInvoices((current) =>
        current.map((item) => (item.id === invoice.id ? { ...item, status: "CANCELLED" as const } : item)),
      );
      setMessage({ text: "تم إلغاء الدفعة", tone: "success" });
    } else {
      setMessage({ text: data.message ?? "تعذر إلغاء الدفعة", tone: "error" });
    }
    setPendingId(null);
  }

  async function reviewRequest(invoice: Invoice, action: "APPROVE" | "REJECT") {
    const confirmed = await confirm({
      title: action === "APPROVE" ? "اعتماد التحويل وتفعيل الاشتراك؟" : "رفض طلب الدفع؟",
      description:
        action === "APPROVE"
          ? `سيتم تفعيل باقة ${invoice.planName ?? "المحددة"} وتمديد الاشتراك ${invoice.periodMonths} شهر.`
          : "سيظهر الطلب للعميل كمرفوض ولن تتغير باقته الحالية.",
      confirmLabel: action === "APPROVE" ? "اعتماد وتفعيل" : "رفض الطلب",
      tone: action === "APPROVE" ? "default" : "danger",
    });
    if (!confirmed) return;

    setPendingId(invoice.id);
    const response = await fetch(`/api/platform/organizations/${organizationId}/payments/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: action === "REJECT" ? "تعذر التحقق من التحويل" : null }),
    });
    const data = (await response.json().catch(() => ({}))) as { invoice?: Invoice; message?: string };
    if (response.ok) {
      setInvoices((current) =>
        current.map((item) =>
          item.id === invoice.id
            ? data.invoice ?? { ...item, status: "CANCELLED" as const, note: "تعذر التحقق من التحويل" }
            : item,
        ),
      );
      setMessage({ text: data.message ?? "تمت مراجعة الطلب", tone: "success" });
    } else {
      setMessage({ text: data.message ?? "تعذر مراجعة الطلب", tone: "error" });
    }
    setPendingId(null);
  }

  return (
    <section id="billing" className="dashboard-panel mt-6 scroll-mt-24 overflow-hidden">
      {confirmDialog}
      <div className="flex items-center gap-2.5 border-b border-salon-line/70 px-5 py-4">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-bold tracking-tight">الاشتراك والدفعات</h2>
          <p className="dashboard-muted mt-0.5 text-sm">
            {currentPeriodEnd ? `الاشتراك ساري حتى ${formatDate(currentPeriodEnd)}` : "لا توجد فترة اشتراك مدفوعة"}
          </p>
        </div>
      </div>

      {message ? (
        <p
          className={`mx-5 mt-4 rounded-lg px-4 py-2.5 text-sm font-bold ${
            message.tone === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-semibold">
          الباقة
          <select value={planId} onChange={(event) => setPlanId(event.target.value)} className="dashboard-field mt-2">
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {plan.priceMonthly} ريال/شهر
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-semibold">
          عدد الأشهر
          <input lang="en"
            type="number"
            min={1}
            max={36}
            value={months}
            onChange={(event) => setMonths(Math.max(1, Number(event.target.value) || 1))}
            className="dashboard-field mt-2"
          />
        </label>

        <label className="text-sm font-semibold">
          المبلغ المحصّل
          <input lang="en"
            name="amount"
            type="number"
            min={0}
            step="0.5"
            required
            defaultValue={suggestedAmount}
            key={suggestedAmount}
            className="dashboard-field mt-2"
          />
          <span className="mt-1.5 block text-xs font-medium text-salon-charcoal/70">
            المقترح حسب الباقة: {formatMoney(suggestedAmount)}
          </span>
        </label>

        <label className="text-sm font-semibold">
          طريقة التحصيل
          <select name="provider" defaultValue="MANUAL_TRANSFER" className="dashboard-field mt-2">
            <option value="MANUAL_TRANSFER">تحويل بنكي</option>
            <option value="MANUAL_CASH">نقدًا</option>
          </select>
        </label>

        <label className="text-sm font-semibold">
          مرجع العملية
          <input name="reference" className="dashboard-field mt-2" placeholder="رقم الحوالة/الإيصال" />
          <span className="mt-1.5 block text-xs font-medium text-salon-charcoal/70">يمنع تسجيل الدفعة مرتين</span>
        </label>

        <label className="text-sm font-semibold">
          ملاحظة
          <input name="note" className="dashboard-field mt-2" placeholder="اختياري" />
        </label>

        <div className="md:col-span-2 xl:col-span-3">
          <button disabled={loading || !planId} className="dashboard-button-gold px-6 py-3">
            {loading ? "جاري التسجيل..." : "تسجيل الدفعة وتجديد الاشتراك"}
          </button>
        </div>
      </form>

      <div className="border-t border-salon-line/70">
        <table className="dashboard-table min-w-[880px]">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الباقة</th>
              <th>المبلغ</th>
              <th>المدة</th>
              <th>تغطي حتى</th>
              <th>الطريقة</th>
              <th>المرجع</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className={invoice.status === "CANCELLED" ? "opacity-55" : undefined}>
                <td className="px-4 py-3">{formatDate(invoice.paidAt ?? invoice.periodStart)}</td>
                <td className="px-4 py-3 font-bold">{invoice.planName ?? "-"}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(invoice.amount)}</td>
                <td className="px-4 py-3 tabular-nums">{invoice.periodMonths} شهر</td>
                <td className="px-4 py-3">{formatDate(invoice.periodEnd)}</td>
                <td className="px-4 py-3">{invoice.providerLabel}</td>
                <td className="px-4 py-3" dir="ltr">
                  {invoice.reference ?? "-"}
                </td>
                <td className="px-4 py-3">
                  <InvoiceStatus status={invoice.status} />
                </td>
                <td className="px-4 py-3">
                  {invoice.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <button type="button" disabled={pendingId === invoice.id} onClick={() => void reviewRequest(invoice, "APPROVE")} className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white">اعتماد</button>
                      <button type="button" disabled={pendingId === invoice.id} onClick={() => void reviewRequest(invoice, "REJECT")} className="dashboard-danger-button px-3 py-1.5 text-xs">رفض</button>
                    </div>
                  ) : invoice.status === "PAID" ? (
                    <button
                      type="button"
                      disabled={pendingId === invoice.id}
                      onClick={() => void voidInvoice(invoice)}
                      className="dashboard-danger-button px-3 py-1.5 text-xs"
                    >
                      إلغاء
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm font-semibold text-salon-charcoal">لا توجد دفعات مسجّلة بعد.</p>
        ) : null}
      </div>
    </section>
  );
}

function InvoiceStatus({ status }: { status: Invoice["status"] }) {
  const labels: Record<Invoice["status"], string> = {
    PENDING: "قيد المراجعة",
    PAID: "مدفوعة",
    FAILED: "فشلت",
    REFUNDED: "مستردة",
    CANCELLED: "ملغاة/مرفوضة",
  };
  const style = status === "PAID" ? "bg-green-50 text-green-700" : status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${style}`}>{labels[status]}</span>;
}
