"use client";

import { FormEvent, useState } from "react";

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
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
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
      setMessage("تم إنشاء الحملة");
    } else {
      setMessage(data.message ?? "تعذر إنشاء الحملة");
    }
    setLoading(false);
  }

  async function updateCampaign(id: string, body: Record<string, unknown>) {
    setMessage("");
    const response = await fetch(`/api/dashboard/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as CampaignResponse;

    if (response.ok && data.campaign) {
      setCampaigns((current) => current.map((campaign) => (campaign.id === id ? data.campaign! : campaign)));
      setMessage("تم تحديث الحملة");
    } else {
      setMessage(data.message ?? "تعذر تحديث الحملة");
    }
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={createCampaign} className="space-y-4 rounded-lg border border-salon-line bg-white p-5">
        <h2 className="text-xl font-bold">إضافة حملة</h2>
        <input name="name" required placeholder="اسم الحملة" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <textarea name="description" placeholder="وصف مختصر" rows={2} className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <div className="grid grid-cols-2 gap-2">
          <select name="discountType" defaultValue="FIXED_AMOUNT" className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="FIXED_AMOUNT">مبلغ ثابت</option>
            <option value="PERCENTAGE">نسبة</option>
          </select>
          <input name="discountValue" required type="number" min={0.01} step="0.01" placeholder="قيمة الخصم" className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        </div>
        <select name="targetType" defaultValue="ALL_CUSTOMERS" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
          <option value="ALL_CUSTOMERS">كل العملاء</option>
          <option value="NEW_CUSTOMERS">عملاء جدد</option>
          <option value="INACTIVE_CUSTOMERS">عملاء منقطعون</option>
          <option value="CUSTOMERS_WITH_MIN_POINTS">حسب رصيد النقاط</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input name="inactiveDays" type="number" min={1} placeholder="أيام الانقطاع" className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <input name="minPoints" type="number" min={1} placeholder="أقل رصيد نقاط" className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-bold text-salon-charcoal">
            البداية
            <input name="startAt" required type="datetime-local" className="mt-1 w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            النهاية
            <input name="endAt" required type="datetime-local" className="mt-1 w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          </label>
        </div>
        <input name="maxUsesPerCustomer" required type="number" min={1} defaultValue={1} placeholder="الاستخدام لكل عميل" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <button disabled={loading} className="w-full rounded-md bg-salon-ink px-4 py-3 font-bold text-white disabled:opacity-60">
          {loading ? "جاري الحفظ..." : "حفظ الحملة"}
        </button>
        {message ? <p className="rounded-md bg-salon-mist px-3 py-2 text-sm text-salon-charcoal">{message}</p> : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-salon-line bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-salon-mist text-salon-charcoal">
            <tr>
              <th className="px-3 py-3 text-right">الحملة</th>
              <th className="px-3 py-3 text-right">الخصم</th>
              <th className="px-3 py-3 text-right">الاستهداف</th>
              <th className="px-3 py-3 text-right">الفترة</th>
              <th className="px-3 py-3 text-right">لكل عميل</th>
              <th className="px-3 py-3 text-right">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-salon-line">
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td className="px-3 py-3">
                  <input
                    defaultValue={campaign.name}
                    onBlur={(event) => event.currentTarget.value !== campaign.name && updateCampaign(campaign.id, { name: event.currentTarget.value })}
                    className="w-full rounded-md border border-salon-line px-2 py-2 font-bold outline-none focus:border-salon-gold"
                  />
                  <p className="mt-1 text-xs text-salon-charcoal">{campaign.description || "بدون وصف"}</p>
                </td>
                <td className="px-3 py-3">
                  {campaign.discountType === "PERCENTAGE" ? "نسبة" : "مبلغ"}: {campaign.discountValue}
                </td>
                <td className="px-3 py-3">{targetLabel(campaign)}</td>
                <td className="px-3 py-3">
                  {new Date(campaign.startAt).toLocaleDateString("ar-SA")} - {new Date(campaign.endAt).toLocaleDateString("ar-SA")}
                </td>
                <td className="px-3 py-3">{campaign.maxUsesPerCustomer}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => updateCampaign(campaign.id, { isActive: !campaign.isActive })}
                    className={`rounded-md px-3 py-2 font-bold ${campaign.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                  >
                    {campaign.isActive ? "فعالة" : "معطلة"}
                  </button>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-salon-charcoal">لا توجد حملات</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function targetLabel(campaign: Campaign) {
  if (campaign.targetType === "NEW_CUSTOMERS") return "عملاء جدد";
  if (campaign.targetType === "INACTIVE_CUSTOMERS") return `منقطعون ${campaign.inactiveDays ?? "-"} يوم`;
  if (campaign.targetType === "CUSTOMERS_WITH_MIN_POINTS") return `نقاط ${campaign.minPoints ?? "-"}+`;
  return "كل العملاء";
}
