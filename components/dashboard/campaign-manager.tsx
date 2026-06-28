"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  discountType: "FIXED_AMOUNT" | "PERCENTAGE";
  discountValue: number;
  targetType: "ALL_CUSTOMERS" | "NEW_CUSTOMERS" | "INACTIVE_CUSTOMERS" | "CUSTOMERS_WITH_MIN_POINTS";
  inactiveDays: number | null;
  minPoints: number | null;
  startAt: string;
  endAt: string;
  maxUsesPerCustomer: number;
  isActive: boolean;
};

type CampaignResponse = {
  campaign?: Campaign;
  message?: string;
};

export function CampaignManager({ initialCampaigns }: { initialCampaigns: Campaign[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || undefined,
        discountType: form.get("discountType"),
        discountValue: form.get("discountValue"),
        targetType: form.get("targetType"),
        inactiveDays: form.get("inactiveDays") || undefined,
        minPoints: form.get("minPoints") || undefined,
        startAt: form.get("startAt"),
        endAt: form.get("endAt"),
        maxUsesPerCustomer: form.get("maxUsesPerCustomer"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as CampaignResponse;

    if (response.ok && data.campaign) {
      setCampaigns((current) => [data.campaign!, ...current]);
      event.currentTarget.reset();
      setToast({ message: "تم إنشاء الحملة بنجاح", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء الحملة", tone: "error" });
    }
    setLoading(false);
  }

  async function updateCampaign(id: string, body: Record<string, unknown>) {
    setToast(null);
    const response = await fetch(`/api/dashboard/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as CampaignResponse;

    if (response.ok && data.campaign) {
      setCampaigns((current) => current.map((campaign) => (campaign.id === id ? data.campaign! : campaign)));
      setToast({ message: "تم تحديث الحملة", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الحملة", tone: "error" });
    }
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[380px_1fr]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <form onSubmit={createCampaign} className="dashboard-panel space-y-4 p-5">
        <h2 className="text-xl font-black">إضافة حملة</h2>
        <input name="name" required placeholder="اسم الحملة" className="dashboard-field" />
        <textarea name="description" placeholder="وصف مختصر" rows={2} className="dashboard-field" />
        <div className="grid grid-cols-2 gap-2">
          <select name="discountType" defaultValue="FIXED_AMOUNT" className="dashboard-field">
            <option value="FIXED_AMOUNT">مبلغ ثابت</option>
            <option value="PERCENTAGE">نسبة</option>
          </select>
          <input name="discountValue" required type="number" min={0.01} step="0.01" placeholder="قيمة الخصم" className="dashboard-field" />
        </div>
        <select name="targetType" defaultValue="ALL_CUSTOMERS" className="dashboard-field">
          <option value="ALL_CUSTOMERS">كل العملاء</option>
          <option value="NEW_CUSTOMERS">عملاء جدد</option>
          <option value="INACTIVE_CUSTOMERS">عملاء منقطعون</option>
          <option value="CUSTOMERS_WITH_MIN_POINTS">حسب رصيد النقاط</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input name="inactiveDays" type="number" min={1} placeholder="أيام الانقطاع" className="dashboard-field" />
          <input name="minPoints" type="number" min={1} placeholder="أقل رصيد نقاط" className="dashboard-field" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-bold text-salon-charcoal">
            البداية
            <input name="startAt" required type="datetime-local" className="dashboard-field mt-1" />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            النهاية
            <input name="endAt" required type="datetime-local" className="dashboard-field mt-1" />
          </label>
        </div>
        <input name="maxUsesPerCustomer" required type="number" min={1} defaultValue={1} placeholder="الاستخدام لكل عميل" className="dashboard-field" />
        <button disabled={loading} className="dashboard-button w-full">
          {loading ? "جاري الحفظ..." : "حفظ الحملة"}
        </button>
      </form>

      <div className="dashboard-panel overflow-x-auto">
        <div className="hidden grid-cols-[1fr_130px_150px_180px_100px_120px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal lg:grid">
          <span>الحملة</span>
          <span>الخصم</span>
          <span>الاستهداف</span>
          <span>الفترة</span>
          <span>لكل عميل</span>
          <span>الحالة</span>
        </div>
        <div className="divide-y divide-salon-line">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm lg:grid-cols-[1fr_130px_150px_180px_100px_120px] lg:items-center lg:gap-3"
            >
              <div className="col-span-2 grid gap-1 lg:col-span-1">
                <span className="text-xs font-bold text-salon-charcoal lg:hidden">الحملة</span>
                <input
                  defaultValue={campaign.name}
                  onBlur={(event) => event.currentTarget.value !== campaign.name && updateCampaign(campaign.id, { name: event.currentTarget.value })}
                  className="dashboard-field py-2 font-bold"
                />
                <p className="mt-1 text-xs text-salon-charcoal">{campaign.description || "بدون وصف"}</p>
              </div>
              <CampaignCell label="الخصم">
                {campaign.discountType === "PERCENTAGE" ? "نسبة" : "مبلغ"}: {campaign.discountValue}
              </CampaignCell>
              <CampaignCell label="الاستهداف">{targetLabel(campaign)}</CampaignCell>
              <CampaignCell label="الفترة">
                {new Date(campaign.startAt).toLocaleDateString("ar-SA")} - {new Date(campaign.endAt).toLocaleDateString("ar-SA")}
              </CampaignCell>
              <CampaignCell label="لكل عميل">{campaign.maxUsesPerCustomer}</CampaignCell>
              <div className="grid gap-1 lg:block">
                <span className="text-xs font-bold text-salon-charcoal lg:hidden">الحالة</span>
                <button
                  type="button"
                  onClick={() => updateCampaign(campaign.id, { isActive: !campaign.isActive })}
                  className={`w-full rounded-lg px-3 py-2 font-bold lg:w-auto ${campaign.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                >
                  {campaign.isActive ? "فعالة" : "معطلة"}
                </button>
              </div>
            </div>
          ))}
          {campaigns.length === 0 ? <p className="px-4 py-8 text-center text-salon-charcoal">لا توجد حملات</p> : null}
        </div>
      </div>
    </div>
  );
}

function CampaignCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 lg:block">
      <span className="text-xs font-bold text-salon-charcoal lg:hidden">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function targetLabel(campaign: Campaign) {
  if (campaign.targetType === "NEW_CUSTOMERS") return "عملاء جدد";
  if (campaign.targetType === "INACTIVE_CUSTOMERS") return `منقطعون ${campaign.inactiveDays ?? "-"} يوم`;
  if (campaign.targetType === "CUSTOMERS_WITH_MIN_POINTS") return `نقاط ${campaign.minPoints ?? "-"}+`;
  return "كل العملاء";
}
