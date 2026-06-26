"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type PlanOption = { id: string; name: string; maxSalons: number };

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  subscriptionStatus: string;
  plan: { id: string; name: string; maxSalons: number } | null;
  counts: { salons: number; users: number; barbers: number; customers: number };
};

export function PlatformOrganizations({
  initialOrganizations,
  plans,
}: {
  initialOrganizations: OrgRow[];
  plans: PlanOption[];
}) {
  const [orgs, setOrgs] = useState(initialOrganizations);
  const [toast, setToast] = useState<ToastState | null>(null);

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

  return (
    <div className="mt-6">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="dashboard-panel overflow-x-auto">
        <table className="dashboard-table min-w-[900px]">
          <thead>
            <tr>
              <th>المؤسسة</th>
              <th>الحالة</th>
              <th>الفروع / الحلاقون / العملاء</th>
              <th>الباقة</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id}>
                <td>
                  <p className="font-bold text-salon-ink">{org.name}</p>
                  <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{org.slug}</p>
                </td>
                <td>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${org.status === "ACTIVE" ? "bg-green-50 text-green-700 ring-green-200/70" : "bg-red-50 text-red-700 ring-red-200/70"}`}>
                    {org.status === "ACTIVE" ? "نشطة" : "موقوفة"}
                  </span>
                </td>
                <td className="tabular-nums">
                  {org.counts.salons} / {org.counts.barbers} / {org.counts.customers}
                </td>
                <td>
                  <select
                    value={org.plan?.id ?? ""}
                    onChange={(event) => patch(org.id, { planId: event.target.value || null }, "تم تحديث باقة المؤسسة")}
                    className="dashboard-field py-2"
                  >
                    <option value="">بدون باقة</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>{plan.name} ({plan.maxSalons} فرع)</option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => patch(org.id, { status: org.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }, "تم تحديث حالة المؤسسة")}
                    className={org.status === "ACTIVE" ? "dashboard-danger-button px-3 py-2 text-xs" : "dashboard-button px-3 py-2 text-xs"}
                  >
                    {org.status === "ACTIVE" ? "إيقاف" : "تفعيل"}
                  </button>
                </td>
              </tr>
            ))}
            {orgs.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-salon-charcoal">لا توجد مؤسسات بعد</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
