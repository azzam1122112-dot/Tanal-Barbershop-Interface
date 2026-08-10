"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import type { PlanSummary } from "@/lib/plans/subscription-service";

type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
type Invoice = {
  id: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
  providerLabel: string;
  amount: number;
  invoiceNumber: string | null;
  issuedAt: string | null;
  periodMonths: number;
  reference: string | null;
  note: string | null;
  planName: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
};

export function SubscriptionSelfService({
  plans,
  currentPlanId,
  initialStatus,
  currentPeriodEnd,
  usage,
  initialInvoices,
  bank,
}: {
  plans: PlanSummary[];
  currentPlanId: string | null;
  initialStatus: SubscriptionStatus;
  currentPeriodEnd: string | null;
  usage: { salons: number; barbers: number; customers: number };
  initialInvoices: Invoice[];
  bank: { bankName: string | null; accountName: string | null; iban: string | null };
}) {
  const [status, setStatus] = useState(initialStatus);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [cycle, setCycle] = useState<1 | 12>(1);
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId && plans.some((plan) => plan.id === currentPlanId) ? currentPlanId : plans[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const pendingInvoice = invoices.find((invoice) => invoice.status === "PENDING") ?? null;
  const amount = selectedPlan
    ? cycle === 12
      ? selectedPlan.priceYearly ?? selectedPlan.priceMonthly * 10
      : selectedPlan.priceMonthly
    : 0;

  const publishedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.priceMonthly - b.priceMonthly),
    [plans],
  );

  async function requestPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan) return;
    const formEl = event.currentTarget;
    setLoading(true);
    setToast(null);
    const form = new FormData(formEl);
    const response = await fetch("/api/dashboard/subscription/payment-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: selectedPlan.id, periodMonths: cycle, reference: form.get("reference") }),
    });
    const data = (await response.json().catch(() => ({}))) as { invoice?: Invoice; message?: string };
    if (response.ok && data.invoice) {
      setInvoices((current) => [data.invoice!, ...current]);
      setToast({ message: "تم إرسال مرجع التحويل، وسنفعّل الباقة بعد التحقق منه", tone: "success" });
      formEl.reset();
    } else {
      setToast({ message: data.message ?? "تعذر إرسال طلب الدفع", tone: "error" });
    }
    setLoading(false);
  }

  async function changeRenewal(action: "CANCEL" | "RESUME") {
    const approved = await confirm({
      title: action === "CANCEL" ? "إلغاء تجديد الاشتراك؟" : "استئناف الاشتراك؟",
      description:
        action === "CANCEL"
          ? currentPeriodEnd
            ? `ستبقى المنصة فعّالة حتى ${formatDate(currentPeriodEnd)} ثم يتوقف التشغيل وتبدأ مهلة عدم نشاط مدتها 60 يومًا. صدّر بياناتك أو جدّد قبل نهايتها لتجنب الحذف النهائي.`
            : "سيتوقف الاشتراك الحالي، ثم تبدأ مهلة عدم نشاط مدتها 60 يومًا قبل الحذف النهائي."
          : `سيستمر اشتراكك الحالي حتى ${formatDate(currentPeriodEnd)}.`,
      confirmLabel: action === "CANCEL" ? "إلغاء التجديد" : "استئناف الاشتراك",
      tone: action === "CANCEL" ? "danger" : "default",
    });
    if (!approved) return;
    setLoading(true);
    const response = await fetch("/api/dashboard/subscription/renewal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await response.json().catch(() => ({}))) as { subscription?: { subscriptionStatus: SubscriptionStatus }; message?: string };
    if (response.ok && data.subscription) {
      setStatus(data.subscription.subscriptionStatus);
      setToast({ message: action === "CANCEL" ? "تم إلغاء التجديد مع حفظ مدة اشتراكك المدفوعة" : "تم استئناف الاشتراك", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الاشتراك", tone: "error" });
    }
    setLoading(false);
  }

  return (
    <div className="mt-6 space-y-6">
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      {pendingInvoice ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950">
          <p className="font-black">طلب الدفع قيد المراجعة</p>
          <p className="mt-1 text-sm font-semibold leading-6">{pendingInvoice.planName} · {formatMoney(pendingInvoice.amount)} · المرجع <span dir="ltr">{pendingInvoice.reference}</span>. لا يلزم إرسال طلب آخر.</p>
        </div>
      ) : null}

      {status === "CANCELED" && currentPeriodEnd ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-900">
          <p className="font-black">التجديد ملغي</p>
          <p className="mt-1 text-sm font-semibold">تستمر الخدمة حتى {formatDate(currentPeriodEnd)} ويمكنك استئنافها قبل هذا التاريخ.</p>
        </div>
      ) : null}

      <section>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-black text-salon-gold">اختر ما يناسبك</p><h2 className="mt-1 text-2xl font-bold">الباقات المنشورة من XMANSX</h2></div>
          <div className="grid grid-cols-2 rounded-xl border border-salon-line bg-white p-1 text-sm font-bold">
            <button type="button" onClick={() => setCycle(1)} className={`rounded-lg px-4 py-2 ${cycle === 1 ? "bg-salon-ink text-white" : "text-salon-charcoal"}`}>شهري</button>
            <button type="button" onClick={() => setCycle(12)} className={`rounded-lg px-4 py-2 ${cycle === 12 ? "bg-salon-ink text-white" : "text-salon-charcoal"}`}>سنوي</button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {publishedPlans.map((plan) => {
            const selected = plan.id === selectedPlanId;
            const current = plan.id === currentPlanId;
            const fits = usage.salons <= plan.maxSalons && (plan.maxBarbers === null || usage.barbers <= plan.maxBarbers) && (plan.maxCustomers === null || usage.customers <= plan.maxCustomers);
            const price = cycle === 12 ? plan.priceYearly ?? plan.priceMonthly * 10 : plan.priceMonthly;
            return (
              <button key={plan.id} type="button" disabled={!fits || Boolean(pendingInvoice)} onClick={() => setSelectedPlanId(plan.id)} className={`relative flex h-full flex-col rounded-3xl border p-5 text-right transition ${selected ? "border-salon-gold bg-white ring-2 ring-salon-gold/30" : "border-salon-line bg-white/80 hover:border-salon-gold/50"} disabled:cursor-not-allowed disabled:opacity-55`}>
                {plan.isFeatured ? <span className="absolute left-4 top-4 rounded-full bg-salon-gold px-3 py-1 text-[10px] font-black text-salon-ink">الأكثر طلبًا</span> : null}
                <p className="text-xl font-black">{plan.name}</p>
                <p className="mt-2 min-h-12 text-sm font-semibold leading-6 text-salon-charcoal">{plan.description}</p>
                <p className="mt-4 text-3xl font-black text-salon-forest">{formatMoney(price)}</p>
                <p className="mt-1 text-xs font-bold text-salon-charcoal/60">{cycle === 12 ? "سنويًا" : "شهريًا"}</p>
                <div className="my-4 h-px bg-salon-line" />
                <ul className="flex-1 space-y-2 text-sm font-bold text-salon-charcoal">
                  {plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
                </ul>
                <span className={`mt-5 rounded-xl px-4 py-2.5 text-center text-sm font-black ${selected ? "bg-salon-ink text-white" : "bg-salon-pearl text-salon-charcoal"}`}>{current ? "باقتك الحالية" : selected ? "تم الاختيار" : fits ? "اختيار الباقة" : "لا تستوعب استخدامك"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="dashboard-panel overflow-hidden">
        <div className="border-b border-salon-line bg-salon-pearl px-5 py-4"><h2 className="text-xl font-bold">الدفع والتحويل</h2><p className="mt-1 text-sm font-semibold text-salon-charcoal">المبلغ يُحسب آليًا ولا تتغير باقتك حتى يعتمد مدير المنصة التحويل.</p></div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr]">
          <BankTransferCard bank={bank} />
          <form onSubmit={requestPayment} className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-salon-mist p-4 sm:col-span-2">
              <p className="text-xs font-bold text-salon-charcoal">الطلب الحالي</p>
              <p className="mt-1 text-lg font-black">{selectedPlan?.name ?? "اختر باقة"} · {formatMoney(amount)}</p>
            </div>
            <label className="text-sm font-bold sm:col-span-2">مرجع التحويل<input name="reference" required minLength={3} maxLength={80} dir="ltr" className="dashboard-field mt-2" placeholder="رقم العملية أو الحوالة" /></label>
            <button disabled={loading || !selectedPlan || Boolean(pendingInvoice)} className="dashboard-button-gold sm:col-span-2">{loading ? "جاري الإرسال..." : pendingInvoice ? "يوجد طلب قيد المراجعة" : "إرسال طلب الدفع"}</button>
          </form>
        </div>
      </section>

      <section className="dashboard-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-salon-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-xl font-bold">إدارة التجديد</h2><p className="mt-1 text-sm font-semibold text-salon-charcoal">الإلغاء لا يحذف البيانات فورًا ولا يسقط المدة المدفوعة؛ تبدأ مهلة الحذف البالغة 60 يومًا بعد توقف الخدمة.</p></div>
          {status === "ACTIVE" ? <button type="button" disabled={loading} onClick={() => void changeRenewal("CANCEL")} className="dashboard-danger-button">إلغاء التجديد</button> : status === "CANCELED" && currentPeriodEnd ? <button type="button" disabled={loading} onClick={() => void changeRenewal("RESUME")} className="dashboard-button">استئناف الاشتراك</button> : null}
        </div>
      </section>

      <section className="dashboard-panel overflow-hidden">
        <div className="border-b border-salon-line px-5 py-4"><h2 className="text-xl font-bold">سجل الطلبات والدفعات</h2></div>
        <div className="table-scroll-wrap"><div className="table-scroll"><table className="dashboard-table min-w-[860px]"><thead><tr><th>التاريخ</th><th>الباقة</th><th>المبلغ</th><th>المدة</th><th>المرجع</th><th>الحالة</th><th>الفاتورة</th></tr></thead><tbody>
          {invoices.map((invoice) => <tr key={invoice.id}><td>{formatDate(invoice.paidAt ?? invoice.createdAt)}</td><td className="font-bold">{invoice.planName ?? "-"}</td><td>{formatMoney(invoice.amount)}</td><td>{invoice.periodMonths} شهر</td><td dir="ltr">{invoice.reference ?? "-"}</td><td><PaymentStatus status={invoice.status} /></td><td>{invoice.status === "PAID" && invoice.invoiceNumber ? <Link href={`/dashboard/subscription/invoices/${invoice.id}`} className="font-bold text-violet-800 underline">عرض {invoice.invoiceNumber}</Link> : "-"}</td></tr>)}
          {invoices.length === 0 ? <tr><td colSpan={7} className="py-8 text-center text-salon-charcoal">لا توجد طلبات دفع بعد.</td></tr> : null}
        </tbody></table></div></div>
      </section>
    </div>
  );
}

function PaymentStatus({ status }: { status: Invoice["status"] }) {
  const labels: Record<Invoice["status"], string> = { PENDING: "قيد المراجعة", PAID: "مدفوعة", FAILED: "فشلت", REFUNDED: "مستردة", CANCELLED: "ملغاة/مرفوضة" };
  const style = status === "PAID" ? "bg-green-50 text-green-700" : status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{labels[status]}</span>;
}

function BankTransferCard({ bank }: { bank: { bankName: string | null; accountName: string | null; iban: string | null } }) {
  const [copied, setCopied] = useState(false);
  const cleanIban = bank.iban?.replace(/\s+/g, "").toUpperCase() ?? "";
  const formattedIban = cleanIban.replace(/(.{4})/g, "$1 ").trim();

  async function copyIban() {
    if (!cleanIban) return;

    try {
      await navigator.clipboard.writeText(cleanIban);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative isolate min-h-[300px] overflow-hidden rounded-[1.75rem] border border-white/10 bg-salon-onyx p-5 text-white shadow-lux-lg sm:p-6">
      <div aria-hidden="true" className="absolute -left-20 -top-24 -z-10 h-64 w-64 rounded-full bg-salon-gold/30 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-28 -right-16 -z-10 h-64 w-64 rounded-full bg-violet-950/80 blur-3xl" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/55 to-transparent" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-200/20 bg-emerald-300/10 text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <BankIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.16em] text-emerald-300">حساب التحويل المعتمد</p>
            <h3 className="mt-1 truncate text-lg font-bold">{bank.bankName ?? "بيانات التحويل البنكي"}</h3>
          </div>
        </div>
        <span dir="ltr" className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-extrabold tracking-[0.18em] text-white/70">XMANSX</span>
      </div>

      <div className="mt-7">
        <p className="text-[11px] font-semibold text-white/45">اسم المستفيد</p>
        <p dir="ltr" className="mt-1.5 text-left text-base font-extrabold tracking-[0.08em] text-white sm:text-lg">
          {bank.accountName ?? "—"}
        </p>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold text-white/45">رقم الآيبان</p>
          {cleanIban ? (
            <button
              type="button"
              onClick={() => void copyIban()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.08] px-2.5 py-1.5 text-[11px] font-bold text-white/80 transition hover:bg-white/[0.14] focus:outline-none focus:ring-2 focus:ring-salon-gold"
              aria-label="نسخ رقم الآيبان"
            >
              {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-300" /> : <CopyIcon className="h-3.5 w-3.5" />}
              {copied ? "تم النسخ" : "نسخ"}
            </button>
          ) : null}
        </div>
        <p dir="ltr" className="mt-3 break-words text-left font-mono text-[15px] font-bold tracking-[0.08em] text-violet-100 sm:text-[17px]">
          {formattedIban || "غير متوفر"}
        </p>
      </div>

      <div className="mt-5 flex items-start gap-2 text-xs font-semibold leading-5 text-white/55">
        <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p>حوّل قيمة الباقة، ثم أدخل رقم العملية في النموذج ليتم اعتماد اشتراكك.</p>
      </div>
    </div>
  );
}

function BankIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m3 9 9-5 9 5" />
      <path d="M5 10v7m4-7v7m6-7v7m4-7v7M3 20h18M2 8h20" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
