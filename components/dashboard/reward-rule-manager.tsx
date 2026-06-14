"use client";

import { FormEvent, useState } from "react";

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

export function RewardRuleManager({ initialRules }: { initialRules: RewardRule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/loyalty/reward-rules", {
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
      event.currentTarget.reset();
      setMessage("تم إنشاء قاعدة المكافأة");
    } else {
      setMessage(data.message ?? "تعذر إنشاء قاعدة المكافأة");
    }
    setLoading(false);
  }

  async function updateRule(id: string, body: Record<string, unknown>) {
    setMessage("");
    const response = await fetch(`/api/dashboard/loyalty/reward-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as RewardRuleResponse;

    if (response.ok && data.rewardRule) {
      setRules((current) => current.map((rule) => (rule.id === id ? data.rewardRule! : rule)));
      setMessage("تم تحديث قاعدة المكافأة");
    } else {
      setMessage(data.message ?? "تعذر تحديث قاعدة المكافأة");
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
      <form onSubmit={createRule} className="space-y-4 rounded-lg border border-salon-line bg-white p-5">
        <h2 className="text-xl font-bold">إضافة مكافأة</h2>
        <input name="requiredPoints" required type="number" min={1} placeholder="النقاط المطلوبة" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <input name="discountAmount" required type="number" min={0.01} step="0.01" placeholder="قيمة الخصم" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <input name="sortOrder" required type="number" step={1} defaultValue={0} placeholder="الترتيب" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <button disabled={loading} className="w-full rounded-md bg-salon-ink px-4 py-3 font-bold text-white disabled:opacity-60">
          {loading ? "جاري الحفظ..." : "حفظ المكافأة"}
        </button>
        {message ? <p className="rounded-md bg-salon-mist px-3 py-2 text-sm text-salon-charcoal">{message}</p> : null}
      </form>

      <div className="overflow-hidden rounded-lg border border-salon-line bg-white">
        <div className="grid grid-cols-[1fr_130px_130px_120px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal">
          <span>المكافأة</span>
          <span>النقاط</span>
          <span>الخصم</span>
          <span>الحالة</span>
        </div>
        <div className="divide-y divide-salon-line">
          {rules.map((rule) => (
            <div key={rule.id} className="grid grid-cols-[1fr_130px_130px_120px] gap-3 px-4 py-4 text-sm">
              <input
                defaultValue={rule.name}
                onBlur={(event) => event.currentTarget.value !== rule.name && updateRule(rule.id, { name: event.currentTarget.value })}
                className="rounded-md border border-salon-line px-2 py-2 font-bold outline-none focus:border-salon-gold"
              />
              <input
                defaultValue={rule.pointsRequired}
                type="number"
                min={1}
                onBlur={(event) => Number(event.currentTarget.value) !== rule.pointsRequired && updateRule(rule.id, { requiredPoints: event.currentTarget.value })}
                className="rounded-md border border-salon-line px-2 py-2 outline-none focus:border-salon-gold"
              />
              <input
                defaultValue={rule.discountAmount}
                type="number"
                min={0.01}
                step="0.01"
                onBlur={(event) => Number(event.currentTarget.value) !== rule.discountAmount && updateRule(rule.id, { discountAmount: event.currentTarget.value })}
                className="rounded-md border border-salon-line px-2 py-2 outline-none focus:border-salon-gold"
              />
              <button
                type="button"
                onClick={() => updateRule(rule.id, { isActive: !rule.isActive })}
                className={`rounded-md px-3 py-2 font-bold ${rule.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
              >
                {rule.isActive ? "فعالة" : "معطلة"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
