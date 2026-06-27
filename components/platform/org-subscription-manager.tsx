"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type PlanOption = { id: string; name: string; priceMonthly: number; maxSalons: number; maxBarbers: number | null };

type Sub = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

const SUB_LABELS: Record<Sub, string> = { TRIALING: "تجربة", ACTIVE: "نشط", PAST_DUE: "متأخر", CANCELED: "ملغى" };

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function fromDateInput(value: string) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

function daysLeft(iso: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function OrgSubscriptionManager({
  orgId,
  initial,
  plans,
}: {
  orgId: string;
  initial: {
    status: "ACTIVE" | "SUSPENDED";
    subscriptionStatus: Sub;
    planId: string | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
  plans: PlanOption[];
}) {
  const [state, setState] = useState(initial);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/platform/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        organization?: { status?: "ACTIVE" | "SUSPENDED"; subscriptionStatus?: Sub; planId?: string | null; trialEndsAt?: string | null; currentPeriodEnd?: string | null };
        message?: string;
      };
      if (response.ok && data.organization) {
        const org = data.organization;
        setState((current) => ({
          status: org.status ?? current.status,
          subscriptionStatus: org.subscriptionStatus ?? current.subscriptionStatus,
          planId: "planId" in org ? org.planId ?? null : current.planId,
          trialEndsAt: "trialEndsAt" in org ? org.trialEndsAt ?? null : current.trialEndsAt,
          currentPeriodEnd: "currentPeriodEnd" in org ? org.currentPeriodEnd ?? null : current.currentPeriodEnd,
        }));
        setToast({ message: successMessage, tone: "success" });
      } else {
        setToast({ message: data.message ?? "تعذر تنفيذ العملية", tone: "error" });
      }
    } finally {
      setBusy(false);
    }
  }

  const trialDays = daysLeft(state.trialEndsAt);
  const periodDays = daysLeft(state.currentPeriodEnd);

  return (
    <section className="dashboard-panel mt-6 p-5">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">إدارة الاشتراك والباقة</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${state.status === "ACTIVE" ? "bg-green-50 text-green-700 ring-green-200/70" : "bg-red-50 text-red-700 ring-red-200/70"}`}>
          {state.status === "ACTIVE" ? "المؤسسة نشطة" : "المؤسسة موقوفة"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* الباقة وحالة الاشتراك */}
        <div className="space-y-3 rounded-xl border border-salon-line/70 bg-salon-pearl/60 p-4">
          <label className="block text-sm font-semibold">
            الباقة
            <select
              value={state.planId ?? ""}
              disabled={busy}
              onChange={(event) => patch({ planId: event.target.value || null }, "تم تحديث الباقة")}
              className="dashboard-field mt-2"
            >
              <option value="">بدون باقة</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · {plan.priceMonthly === 0 ? "مجانية" : `${plan.priceMonthly} ريال/شهر`}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            حالة الاشتراك
            <select
              value={state.subscriptionStatus}
              disabled={busy}
              onChange={(event) => patch({ subscriptionStatus: event.target.value }, "تم تحديث حالة الاشتراك")}
              className="dashboard-field mt-2"
            >
              {(Object.keys(SUB_LABELS) as Sub[]).map((key) => (
                <option key={key} value={key}>{SUB_LABELS[key]}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            {state.status === "ACTIVE" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("إيقاف المؤسسة يقطع وصول كل مستخدميها فورًا. متابعة؟")) patch({ status: "SUSPENDED" }, "تم إيقاف المؤسسة");
                }}
                className="dashboard-danger-button px-3 py-2 text-xs"
              >
                إيقاف المؤسسة
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => patch({ status: "ACTIVE" }, "تم تفعيل المؤسسة")} className="dashboard-button px-3 py-2 text-xs">
                تفعيل المؤسسة
              </button>
            )}
          </div>
        </div>

        {/* التواريخ */}
        <div className="space-y-3 rounded-xl border border-salon-line/70 bg-salon-pearl/60 p-4">
          <div>
            <label className="block text-sm font-semibold">
              نهاية التجربة
              <input
                type="date"
                value={toDateInput(state.trialEndsAt)}
                disabled={busy}
                onChange={(event) => patch({ trialEndsAt: fromDateInput(event.target.value) }, "تم تحديث نهاية التجربة")}
                dir="ltr"
                className="dashboard-field mt-2"
              />
            </label>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={busy} onClick={() => patch({ extendTrialDays: 14 }, "تم تمديد التجربة 14 يومًا")} className="dashboard-button-soft px-2.5 py-1.5 text-xs">+14 يوم تجربة</button>
              {trialDays !== null ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${trialDays < 0 ? "bg-red-50 text-red-700" : trialDays <= 3 ? "bg-amber-50 text-amber-700" : "bg-salon-pearl text-salon-charcoal"}`}>
                  {trialDays < 0 ? "انتهت" : `${trialDays} يوم`}
                </span>
              ) : null}
            </div>
          </div>

          <div className="border-t border-salon-line/70 pt-3">
            <label className="block text-sm font-semibold">
              نهاية الاشتراك (الباقة الشهرية)
              <input
                type="date"
                value={toDateInput(state.currentPeriodEnd)}
                disabled={busy}
                onChange={(event) => patch({ currentPeriodEnd: fromDateInput(event.target.value) }, "تم تحديث نهاية الاشتراك")}
                dir="ltr"
                className="dashboard-field mt-2"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ subscriptionStatus: "ACTIVE", extendPeriodDays: 30 }, "تم تفعيل اشتراك شهري")}
                className="dashboard-button-gold px-3 py-1.5 text-xs"
              >
                تفعيل شهر (+30)
              </button>
              <button type="button" disabled={busy} onClick={() => patch({ extendPeriodDays: 30 }, "تم تمديد الاشتراك شهرًا")} className="dashboard-button-soft px-2.5 py-1.5 text-xs">+شهر</button>
              {periodDays !== null ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${periodDays < 0 ? "bg-red-50 text-red-700" : periodDays <= 5 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                  {periodDays < 0 ? "منتهٍ" : `${periodDays} يوم`}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
