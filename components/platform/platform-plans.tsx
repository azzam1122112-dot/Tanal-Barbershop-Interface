"use client";

import { FormEvent, useMemo, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { formatMoney, formatNumber } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  features: string[];
  maxSalons: number;
  maxBarbers: number | null;
  maxCustomers: number | null;
  isActive: boolean;
  isPublic: boolean;
  isFeatured: boolean;
  isSignupDefault: boolean;
  trialDays: number;
  sortOrder: number;
  organizationsCount: number;
};

function featuresFrom(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function planBody(form: FormData) {
  return {
    name: form.get("name"),
    description: form.get("description") || null,
    priceMonthly: form.get("priceMonthly"),
    priceYearly: form.get("priceYearly") || null,
    features: featuresFrom(form.get("features")),
    maxSalons: form.get("maxSalons"),
    maxBarbers: form.get("maxBarbers") || null,
    maxCustomers: form.get("maxCustomers") || null,
    sortOrder: form.get("sortOrder") || 0,
    isPublic: form.get("isPublic") === "on",
    isFeatured: form.get("isFeatured") === "on",
    isSignupDefault: form.get("isSignupDefault") === "on",
    trialDays: form.get("trialDays") || 14,
  };
}

export function PlatformPlans({ initialPlans }: { initialPlans: PlanRow[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const stats = useMemo(
    () => ({
      total: plans.length,
      public: plans.filter((plan) => plan.isActive && plan.isPublic).length,
      subscribers: plans.reduce((total, plan) => total + plan.organizationsCount, 0),
    }),
    [plans],
  );

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setToast(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const response = await safeFetch("/api/platform/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: form.get("slug"), ...planBody(form) }),
    });
    const data = (await response.json().catch(() => ({}))) as { plan?: PlanRow; message?: string };

    if (response.ok && data.plan) {
      setPlans((current) => [...current, data.plan!].sort((a, b) => a.sortOrder - b.sortOrder));
      formEl.reset();
      setToast({ message: "تم إنشاء الباقة وربطها بقنوات العرض", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء الباقة", tone: "error" });
    }
    setPending(false);
  }

  async function patchPlan(id: string, body: Record<string, unknown>, successMessage: string) {
    const response = await safeFetch(`/api/platform/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setToast({ message: data.message ?? "تعذر تحديث الباقة", tone: "error" });
      return false;
    }
    setToast({ message: successMessage, tone: "success" });
    return true;
  }

  async function toggle(plan: PlanRow, field: "isActive" | "isPublic" | "isFeatured" | "isSignupDefault") {
    const next = !plan[field];
    if (!(await patchPlan(plan.id, { [field]: next }, "تم تحديث حالة الباقة"))) return;
    setPlans((current) =>
      current.map((item) => ({
        ...item,
        ...(field === "isSignupDefault" && next ? { isSignupDefault: item.id === plan.id } : {}),
        ...(item.id === plan.id ? { [field]: next } : {}),
      })),
    );
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, plan: PlanRow) {
    event.preventDefault();
    setPending(true);
    const body = planBody(new FormData(event.currentTarget));
    if (await patchPlan(plan.id, body, "تم حفظ الباقة وتحديث ظهورها")) {
      setPlans((current) =>
        current
          .map((item) =>
            item.id === plan.id
              ? {
                  ...item,
                  name: String(body.name),
                  description: body.description ? String(body.description) : null,
                  priceMonthly: Number(body.priceMonthly),
                  priceYearly: body.priceYearly ? Number(body.priceYearly) : null,
                  features: body.features,
                  maxSalons: Number(body.maxSalons),
                  maxBarbers: body.maxBarbers ? Number(body.maxBarbers) : null,
                  maxCustomers: body.maxCustomers ? Number(body.maxCustomers) : null,
                  sortOrder: Number(body.sortOrder),
                  isPublic: body.isPublic,
                  isFeatured: body.isFeatured,
                  isSignupDefault: body.isSignupDefault,
                  trialDays: Number(body.trialDays),
                }
              : body.isSignupDefault
                ? { ...item, isSignupDefault: false }
                : item,
          )
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setEditingId(null);
    }
    setPending(false);
  }

  return (
    <div className="mt-6 space-y-6">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="إجمالي الباقات" value={stats.total} />
        <Metric label="منشورة للعملاء" value={stats.public} tone="green" />
        <Metric label="المؤسسات المرتبطة" value={stats.subscribers} tone="gold" />
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[390px_1fr]">
        <form onSubmit={createPlan} className="dashboard-panel h-fit overflow-hidden">
          <div className="border-b border-salon-line bg-salon-ink px-5 py-4 text-white">
            <p className="text-xs font-black text-salon-gold">مصدر موحّد</p>
            <h2 className="mt-1 text-xl font-bold">إنشاء باقة جديدة</h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-white/65">ستظهر مباشرة في الهبوط واشتراكات العملاء عند نشرها.</p>
          </div>
          <PlanFields />
          <div className="px-5 pb-5">
            <button disabled={pending} className="dashboard-button-gold w-full">{pending ? "جاري الحفظ..." : "حفظ الباقة"}</button>
          </div>
        </form>

        <div className="space-y-4">
          {plans.map((plan) => (
            <article key={plan.id} className={`dashboard-panel overflow-hidden ${plan.isFeatured ? "ring-2 ring-salon-gold/50" : ""}`}>
              {editingId === plan.id ? (
                <form onSubmit={(event) => saveEdit(event, plan)}>
                  <div className="flex items-center justify-between border-b border-salon-line bg-salon-pearl px-5 py-4">
                    <div><p className="text-xs font-bold text-salon-gold">تعديل الباقة</p><h3 className="mt-1 text-lg font-bold">{plan.name}</h3></div>
                    <button type="button" onClick={() => setEditingId(null)} className="dashboard-button-soft px-3 py-2 text-xs">إلغاء</button>
                  </div>
                  <PlanFields plan={plan} />
                  <div className="flex justify-end px-5 pb-5"><button disabled={pending} className="dashboard-button-gold px-6">حفظ التغييرات</button></div>
                </form>
              ) : (
                <>
                  <div className="flex flex-col gap-4 border-b border-salon-line px-5 py-5 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold">{plan.name}</h3>
                        {plan.isFeatured ? <Badge tone="gold">الأكثر طلبًا</Badge> : null}
                        {plan.isSignupDefault ? <Badge tone="violet">التجربة الافتراضية</Badge> : null}
                        {plan.isSignupDefault ? <Badge tone="gold">{plan.trialDays} يومًا</Badge> : null}
                        {!plan.isActive ? <Badge tone="red">معطلة</Badge> : plan.isPublic ? <Badge tone="green">منشورة</Badge> : <Badge tone="gray">داخلية</Badge>}
                      </div>
                      <p className="mt-1 text-xs font-semibold text-salon-charcoal/60" dir="ltr">{plan.slug}</p>
                      {plan.description ? <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-salon-charcoal">{plan.description}</p> : null}
                    </div>
                    <div className="shrink-0 text-left md:text-right">
                      <p className="text-2xl font-black text-salon-forest">{formatMoney(plan.priceMonthly)}<span className="text-xs text-salon-charcoal/60"> / شهر</span></p>
                      <p className="mt-1 text-sm font-bold text-salon-charcoal">{plan.priceYearly == null ? "لا يوجد سعر سنوي" : `${formatMoney(plan.priceYearly)} / سنة`}</p>
                    </div>
                  </div>
                  <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-lg bg-salon-pearl px-3 py-2">{plan.maxSalons} فرع</span>
                        <span className="rounded-lg bg-salon-pearl px-3 py-2">{plan.maxBarbers ?? "∞"} حلاق</span>
                        <span className="rounded-lg bg-salon-pearl px-3 py-2">{plan.maxCustomers ?? "∞"} عميل</span>
                        <span className="rounded-lg bg-salon-pearl px-3 py-2">{formatNumber(plan.organizationsCount)} مؤسسة</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-salon-charcoal">
                        {plan.features.map((feature) => <span key={feature}>✓ {feature}</span>)}
                        {plan.features.length === 0 ? <span className="text-salon-charcoal/55">لم تُضف مزايا عرض بعد.</span> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:max-w-[270px] lg:justify-end">
                      <button type="button" onClick={() => setEditingId(plan.id)} className="dashboard-button-soft px-3 py-2 text-xs">تعديل كامل</button>
                      <ToggleButton active={plan.isActive} onClick={() => void toggle(plan, "isActive")}>{plan.isActive ? "فعالة" : "معطلة"}</ToggleButton>
                      <ToggleButton active={plan.isPublic} onClick={() => void toggle(plan, "isPublic")}>{plan.isPublic ? "منشورة" : "داخلية"}</ToggleButton>
                      <ToggleButton active={plan.isFeatured} onClick={() => void toggle(plan, "isFeatured")}>تمييز</ToggleButton>
                      <ToggleButton active={plan.isSignupDefault} onClick={() => void toggle(plan, "isSignupDefault")}>تجربة</ToggleButton>
                    </div>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanFields({ plan }: { plan?: PlanRow }) {
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-2">
      <label className="text-sm font-bold">اسم الباقة<input name="name" required defaultValue={plan?.name} className="dashboard-field mt-2" placeholder="إكس مانس إكس XMANSX نمو" /></label>
      {!plan ? <label className="text-sm font-bold">المعرّف<input name="slug" required dir="ltr" className="dashboard-field mt-2" placeholder="xmansx-growth" /></label> : null}
      <label className="text-sm font-bold sm:col-span-2">الوصف<textarea name="description" rows={2} defaultValue={plan?.description ?? ""} className="dashboard-field mt-2 resize-y" placeholder="لمن صُممت هذه الباقة؟" /></label>
      <label className="text-sm font-bold">السعر الشهري<input name="priceMonthly" type="number" min={0} step={0.01} required defaultValue={plan?.priceMonthly ?? 0} className="dashboard-field mt-2" /></label>
      <label className="text-sm font-bold">السعر السنوي<input name="priceYearly" type="number" min={0} step={0.01} defaultValue={plan?.priceYearly ?? ""} className="dashboard-field mt-2" placeholder="اختياري" /></label>
      <label className="text-sm font-bold">حد الفروع<input name="maxSalons" type="number" min={1} required defaultValue={plan?.maxSalons ?? 1} className="dashboard-field mt-2" /></label>
      <label className="text-sm font-bold">حد الحلاقين<input name="maxBarbers" type="number" min={1} defaultValue={plan?.maxBarbers ?? ""} className="dashboard-field mt-2" placeholder="بلا حد" /></label>
      <label className="text-sm font-bold">حد العملاء<input name="maxCustomers" type="number" min={1} defaultValue={plan?.maxCustomers ?? ""} className="dashboard-field mt-2" placeholder="بلا حد" /></label>
      <label className="text-sm font-bold">ترتيب العرض<input name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} className="dashboard-field mt-2" /></label>
      <label className="text-sm font-bold">مدة التجربة بالأيام<input name="trialDays" type="number" min={1} max={365} required defaultValue={plan?.trialDays ?? 14} className="dashboard-field mt-2" /><span className="mt-1 block text-[11px] font-semibold text-salon-charcoal/60">تُطبق عند اختيار هذه الباقة كباقة التجربة.</span></label>
      <label className="text-sm font-bold sm:col-span-2">المزايا المعروضة<textarea name="features" rows={5} defaultValue={plan?.features.join("\n") ?? ""} className="dashboard-field mt-2 resize-y" placeholder={"ميزة واحدة في كل سطر\nعملاء غير محدودين\nدعم بأولوية"} /></label>
      <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
        <Check name="isPublic" defaultChecked={plan?.isPublic ?? true} label="منشورة للعملاء" />
        <Check name="isFeatured" defaultChecked={plan?.isFeatured ?? false} label="الأكثر طلبًا" />
        <Check name="isSignupDefault" defaultChecked={plan?.isSignupDefault ?? false} label="باقة التجربة" />
      </div>
    </div>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return <label className="flex items-center justify-between gap-2 rounded-xl border border-salon-line bg-salon-pearl px-3 py-2.5 text-xs font-bold"><span>{label}</span><input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5 accent-salon-forest" /></label>;
}

function Metric({ label, value, tone = "ink" }: { label: string; value: number; tone?: "ink" | "green" | "gold" }) {
  const color = tone === "green" ? "text-green-700" : tone === "gold" ? "text-salon-gold" : "text-salon-ink";
  return <div className="dashboard-panel p-4"><p className="text-xs font-bold text-salon-charcoal">{label}</p><p className={`mt-2 text-3xl font-black ${color}`}>{formatNumber(value)}</p></div>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "gold" | "violet" | "red" | "green" | "gray" }) {
  const styles = { gold: "bg-amber-50 text-amber-800", violet: "bg-violet-50 text-violet-800", red: "bg-red-50 text-red-700", green: "bg-green-50 text-green-700", gray: "bg-slate-100 text-slate-600" };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${styles[tone]}`}>{children}</span>;
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-xs font-bold ${active ? "bg-salon-forest text-white" : "bg-salon-pearl text-salon-charcoal"}`}>{children}</button>;
}
