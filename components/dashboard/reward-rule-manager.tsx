"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { safeFetch } from "@/lib/http/safe-fetch";

type RewardRule = {
  id: string;
  name: string;
  pointsRequired: number;
  discountAmount: number;
  isActive: boolean;
  sortOrder: number;
};

type RewardRuleResponse = {
  rewardRule?: RewardRule;
  message?: string;
};

export function RewardRuleManager({ initialRules, readOnly = false }: { initialRules: RewardRule[]; readOnly?: boolean }) {
  const [rules, setRules] = useState(initialRules);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await safeFetch("/api/dashboard/loyalty/reward-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requiredPoints: form.get("requiredPoints"),
        discountAmount: form.get("discountAmount"),
        sortOrder: form.get("sortOrder"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as RewardRuleResponse;

    if (response.ok && data.rewardRule) {
      setRules((current) => [...current, data.rewardRule!].sort((a, b) => a.sortOrder - b.sortOrder || a.pointsRequired - b.pointsRequired));
      formElement.reset();
      setToast({ message: "تم إنشاء قاعدة المكافأة", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء قاعدة المكافأة", tone: "error" });
    }
    setLoading(false);
  }

  async function updateRule(id: string, body: Record<string, unknown>) {
    setToast(null);
    const response = await safeFetch(`/api/dashboard/loyalty/reward-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as RewardRuleResponse;

    if (response.ok && data.rewardRule) {
      setRules((current) => current.map((rule) => (rule.id === id ? data.rewardRule! : rule)));
      setToast({ message: "تم تحديث قاعدة المكافأة", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث قاعدة المكافأة", tone: "error" });
    }
  }

  return (
    <div className={`mt-8 grid gap-6 ${readOnly ? "" : "lg:grid-cols-[360px_1fr]"}`}>
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      {readOnly ? null : (
        <form onSubmit={createRule} className="dashboard-panel space-y-4 p-5">
          <h2 className="text-xl font-bold">إضافة مكافأة</h2>
          <input lang="en" name="requiredPoints" required type="number" min={1} placeholder="النقاط المطلوبة" className="dashboard-field" />
          <input lang="en" name="discountAmount" required type="number" min={0.01} step="0.01" placeholder="قيمة الخصم" className="dashboard-field" />
          <input lang="en" name="sortOrder" required type="number" step={1} defaultValue={0} placeholder="الترتيب" className="dashboard-field" />
          <button disabled={loading} className="dashboard-button w-full">
            {loading ? "جاري الحفظ..." : "حفظ المكافأة"}
          </button>
        </form>
      )}

      <div className="dashboard-panel overflow-x-auto">
        <div className="hidden grid-cols-[1fr_130px_130px_120px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal md:grid">
          <span>المكافأة</span>
          <span>النقاط</span>
          <span>الخصم</span>
          <span>الحالة</span>
        </div>
        <div className="divide-y divide-salon-line">
          {rules.map((rule) => (
            <div key={rule.id} className="grid grid-cols-2 items-start gap-3 px-4 py-4 text-sm md:grid-cols-[1fr_130px_130px_120px] md:items-center">
              <label className="col-span-2 grid gap-1 md:col-span-1 md:block">
                <span className="text-xs font-bold text-salon-charcoal md:hidden">المكافأة</span>
                <input
                  defaultValue={rule.name}
                  readOnly={readOnly}
                  onBlur={(event) => !readOnly && event.currentTarget.value !== rule.name && updateRule(rule.id, { name: event.currentTarget.value })}
                  className={`dashboard-field py-2 font-bold ${readOnly ? "cursor-default bg-salon-pearl/60" : ""}`}
                />
              </label>
              <label className="grid gap-1 md:block">
                <span className="text-xs font-bold text-salon-charcoal md:hidden">النقاط</span>
                <input lang="en"
                  defaultValue={rule.pointsRequired}
                  type="number"
                  min={1}
                  readOnly={readOnly}
                  onBlur={(event) => !readOnly && Number(event.currentTarget.value) !== rule.pointsRequired && updateRule(rule.id, { requiredPoints: event.currentTarget.value })}
                  className={`dashboard-field py-2 ${readOnly ? "cursor-default bg-salon-pearl/60" : ""}`}
                />
              </label>
              <label className="grid gap-1 md:block">
                <span className="text-xs font-bold text-salon-charcoal md:hidden">الخصم</span>
                <input lang="en"
                  defaultValue={rule.discountAmount}
                  type="number"
                  min={0.01}
                  step="0.01"
                  readOnly={readOnly}
                  onBlur={(event) => !readOnly && Number(event.currentTarget.value) !== rule.discountAmount && updateRule(rule.id, { discountAmount: event.currentTarget.value })}
                  className={`dashboard-field py-2 ${readOnly ? "cursor-default bg-salon-pearl/60" : ""}`}
                />
              </label>
              <div className="grid gap-1 md:block">
                <span className="text-xs font-bold text-salon-charcoal md:hidden">الحالة</span>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => updateRule(rule.id, { isActive: !rule.isActive })}
                  className={`w-full rounded-lg px-3 py-2 font-bold md:w-auto ${rule.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"} ${readOnly ? "cursor-default" : ""}`}
                >
                  {rule.isActive ? "فعالة" : "معطلة"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
