"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

type PlanOption = { id: string; name: string; maxSalons: number; maxBarbers: number | null; maxCustomers: number | null };

type OrgRow = {
  id: string;
  name: string;
  city: string | null;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  subscriptionStatus: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  plan: PlanOption | null;
  trialEndsAt: string | null;
  counts: { salons: number; users: number; barbers: number; customers: number; billingInvoices: number };
};

const SUB_LABELS: Record<OrgRow["subscriptionStatus"], string> = {
  TRIALING: "تجربة",
  ACTIVE: "نشط",
  PAST_DUE: "متأخر",
  CANCELED: "ملغى",
};

function trialDaysLeft(trialEndsAt: string | null) {
  if (!trialEndsAt) return null;
  return Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function PlatformOrganizations({
  initialOrganizations,
  plans,
}: {
  initialOrganizations: OrgRow[];
  plans: PlanOption[];
}) {
  const [orgs, setOrgs] = useState(initialOrganizations);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  async function patch(id: string, body: Record<string, unknown>, successMessage: string) {
    const response = await fetch(`/api/platform/organizations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { organization?: Partial<OrgRow>; message?: string };
    if (response.ok && data.organization) {
      setOrgs((current) =>
        current.map((org) =>
          org.id === id
            ? {
                ...org,
                status: (data.organization!.status as OrgRow["status"]) ?? org.status,
                subscriptionStatus: (data.organization!.subscriptionStatus as OrgRow["subscriptionStatus"]) ?? org.subscriptionStatus,
                trialEndsAt: "trialEndsAt" in data.organization! ? (data.organization!.trialEndsAt as string | null) : org.trialEndsAt,
                plan: "planId" in body ? plans.find((plan) => plan.id === body.planId) ?? null : org.plan,
              }
            : org,
        ),
      );
      setToast({ message: successMessage, tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تنفيذ العملية", tone: "error" });
    }
  }

  async function suspend(org: OrgRow) {
    const confirmed = await confirm({
      title: `إيقاف «${org.name}»؟`,
      description: "سيقطع وصول كل مستخدميها فورًا.",
      confirmLabel: "إيقاف المؤسسة",
      tone: "danger",
    });
    if (!confirmed) return;
    patch(org.id, { status: "SUSPENDED" }, "تم إيقاف المؤسسة");
  }

  return (
    <div className="mt-4">
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="grid gap-3 lg:hidden">
        {orgs.map((org) => {
          const days = trialDaysLeft(org.trialEndsAt);
          return (
            <article key={org.id} className="dashboard-panel overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-salon-line/70 bg-gradient-to-b from-white to-salon-pearl/60 px-4 py-4">
                <div className="min-w-0">
                  <Link href={`/platform/organizations/${org.id}`} className="block truncate text-lg font-bold text-salon-ink">{org.name}</Link>
                  <p className="mt-1 truncate text-xs font-semibold text-salon-charcoal/60" dir="ltr">{org.slug}</p>
                  {org.city ? <p className="mt-1 text-xs font-bold text-salon-charcoal/70">{org.city}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${org.status === "ACTIVE" ? "bg-green-50 text-green-700 ring-green-200/70" : "bg-red-50 text-red-700 ring-red-200/70"}`}>{org.status === "ACTIVE" ? "نشطة" : "موقوفة"}</span>
                  {org.counts.billingInvoices > 0 ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">طلب دفع</span> : null}
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-x-reverse divide-salon-line/70 border-b border-salon-line/70 px-2 py-3 text-center">
                <MobileCount label="فروع" value={org.counts.salons} />
                <MobileCount label="حلاقون" value={org.counts.barbers} />
                <MobileCount label="عملاء" value={org.counts.customers} />
              </div>
              <div className="space-y-3 p-4">
                <label className="block text-xs font-bold text-salon-charcoal">حالة الاشتراك
                  <div className="mt-1.5 flex items-center gap-2">
                    <select value={org.subscriptionStatus} onChange={(event) => patch(org.id, { subscriptionStatus: event.target.value }, "تم تحديث حالة الاشتراك")} className="dashboard-field py-2 text-xs">
                      {(Object.keys(SUB_LABELS) as OrgRow["subscriptionStatus"][]).map((key) => <option key={key} value={key}>{SUB_LABELS[key]}</option>)}
                    </select>
                    {org.subscriptionStatus === "TRIALING" && days !== null ? <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${days <= 2 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{days >= 0 ? `${days} يوم` : "انتهت"}</span> : null}
                  </div>
                </label>
                <label className="block text-xs font-bold text-salon-charcoal">الباقة
                  <select value={org.plan?.id ?? ""} onChange={(event) => patch(org.id, { planId: event.target.value || null }, "تم تحديث باقة المؤسسة")} className="dashboard-field mt-1.5 py-2 text-xs">
                    <option value="">بدون باقة</option>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Link href={`/platform/organizations/${org.id}`} className="dashboard-button-soft px-2 py-2 text-xs">التفاصيل</Link>
                  <button type="button" onClick={() => patch(org.id, { extendTrialDays: 14 }, "تم تمديد التجربة 14 يومًا")} className="dashboard-button-soft px-2 py-2 text-xs">+14 يوم</button>
                  {org.status === "ACTIVE" ? <button type="button" onClick={() => suspend(org)} className="dashboard-danger-button px-2 py-2 text-xs">إيقاف</button> : <button type="button" onClick={() => patch(org.id, { status: "ACTIVE" }, "تم تفعيل المؤسسة")} className="dashboard-button px-2 py-2 text-xs">تفعيل</button>}
                </div>
              </div>
            </article>
          );
        })}
        {orgs.length === 0 ? <div className="dashboard-panel px-5 py-10 text-center text-sm font-semibold text-salon-charcoal">لا توجد مؤسسات مطابقة.</div> : null}
      </div>

      <div className="dashboard-panel table-scroll-wrap hidden overflow-hidden lg:block">
        <div className="table-scroll">
        <table className="dashboard-table min-w-[1080px]">
          <thead>
            <tr>
              <th>المؤسسة</th>
              <th>الحالة</th>
              <th>الاشتراك</th>
              <th>الاستهلاك</th>
              <th>الباقة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const days = trialDaysLeft(org.trialEndsAt);
              return (
                <tr key={org.id}>
                  <td>
                    <Link href={`/platform/organizations/${org.id}`} className="font-bold text-salon-ink hover:text-salon-gold hover:underline">{org.name}</Link>
                    <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{org.slug}</p>
                    {org.city ? <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">{org.city}</p> : null}
                  </td>
                  <td>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${org.status === "ACTIVE" ? "bg-green-50 text-green-700 ring-green-200/70" : "bg-red-50 text-red-700 ring-red-200/70"}`}>
                      {org.status === "ACTIVE" ? "نشطة" : "موقوفة"}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <select
                        value={org.subscriptionStatus}
                        onChange={(event) => patch(org.id, { subscriptionStatus: event.target.value }, "تم تحديث حالة الاشتراك")}
                        className="dashboard-field py-1.5 text-xs"
                      >
                        {(Object.keys(SUB_LABELS) as OrgRow["subscriptionStatus"][]).map((key) => (
                          <option key={key} value={key}>{SUB_LABELS[key]}</option>
                        ))}
                      </select>
                      {org.subscriptionStatus === "TRIALING" && days !== null ? (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${days <= 2 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                          {days >= 0 ? `${days} يوم` : "انتهت"}
                        </span>
                      ) : null}
                      {org.counts.billingInvoices > 0 ? <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">دفع معلق</span> : null}
                    </div>
                  </td>
                  <td className="text-xs tabular-nums text-salon-charcoal">
                    {org.counts.salons} فرع · {org.counts.barbers} حلاق · {org.counts.customers} عميل
                  </td>
                  <td>
                    <select
                      value={org.plan?.id ?? ""}
                      onChange={(event) => patch(org.id, { planId: event.target.value || null }, "تم تحديث باقة المؤسسة")}
                      className="dashboard-field py-1.5 text-xs"
                    >
                      <option value="">بدون باقة</option>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} ({plan.maxSalons} فرع · {plan.maxBarbers ?? "∞"} حلاق)
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => patch(org.id, { extendTrialDays: 14 }, "تم تمديد التجربة 14 يومًا")}
                        className="dashboard-button-soft px-2.5 py-1.5 text-xs"
                      >
                        +14 يوم
                      </button>
                      {org.status === "ACTIVE" ? (
                        <button type="button" onClick={() => suspend(org)} className="dashboard-danger-button px-2.5 py-1.5 text-xs">إيقاف</button>
                      ) : (
                        <button type="button" onClick={() => patch(org.id, { status: "ACTIVE" }, "تم تفعيل المؤسسة")} className="dashboard-button px-2.5 py-1.5 text-xs">تفعيل</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {orgs.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-salon-charcoal">لا توجد مؤسسات مطابقة</td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function MobileCount({ label, value }: { label: string; value: number }) {
  return <div><p className="text-lg font-black tabular-nums text-salon-ink">{value}</p><p className="mt-0.5 text-[10px] font-bold text-salon-charcoal/60">{label}</p></div>;
}
