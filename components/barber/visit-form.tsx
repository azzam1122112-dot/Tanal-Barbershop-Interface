"use client";

import { FormEvent, useState } from "react";

type ServiceOption = {
  id: string;
  name: string;
  defaultPrice: number;
};

type VisitPreview = {
  customer: { id: string; name: string; phone: string };
  barber: { id: string; name: string };
  services: ServiceOption[];
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentMethod: "CASH" | "NETWORK";
  expectedPointsEarned: number;
  pointsBalance: number;
  availableRewards: Array<{
    id: string;
    pointsRequired: number;
    discountAmount: number;
    label: string;
  }>;
  availableCampaigns: Array<{
    id: string;
    name: string;
    description: string | null;
    discountType: "FIXED_AMOUNT" | "PERCENTAGE";
    discountAmount: number;
    label: string;
  }>;
};

export function VisitForm({ customerId, services }: { customerId: string; services: ServiceOption[] }) {
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [grossAmount, setGrossAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "NETWORK">("CASH");
  const [preview, setPreview] = useState<VisitPreview | null>(null);
  const [selectedDiscount, setSelectedDiscount] = useState("NONE");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);

  function toggleService(id: string) {
    setPreview(null);
    setSelectedDiscount("NONE");
    setSelectedServices((current) => (current.includes(id) ? current.filter((serviceId) => serviceId !== id) : [...current, id]));
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoadingPreview(true);

    const response = await fetch("/api/barber/visits/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        serviceIds: selectedServices,
        grossAmount,
        paymentMethod,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { preview?: VisitPreview; message?: string };

    if (response.ok && data.preview) {
      setPreview(data.preview);
      setSelectedDiscount("NONE");
      setIdempotencyKey(crypto.randomUUID());
    } else {
      setMessage(data.message ?? "تعذر حساب المعاينة");
    }
    setLoadingPreview(false);
  }

  async function confirmVisit() {
    setMessage("");
    setLoadingConfirm(true);

    const response = await fetch("/api/barber/visits/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId,
        serviceIds: selectedServices,
        grossAmount,
        paymentMethod,
        rewardRuleId: selectedDiscount.startsWith("REWARD:") ? selectedDiscount.replace("REWARD:", "") : undefined,
        campaignId: selectedDiscount.startsWith("CAMPAIGN:") ? selectedDiscount.replace("CAMPAIGN:", "") : undefined,
        idempotencyKey,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { visit?: { id: string; customer: { id: string } }; message?: string };

    if (response.ok && data.visit) {
      setMessage("تم حفظ الزيارة بنجاح");
      window.location.href = `/barber/customers/${data.visit.customer.id}`;
      return;
    }

    setMessage(data.message ?? "تعذر حفظ الزيارة");
    setLoadingConfirm(false);
  }

  const selectedReward = selectedDiscount.startsWith("REWARD:")
    ? preview?.availableRewards.find((reward) => reward.id === selectedDiscount.replace("REWARD:", ""))
    : undefined;
  const selectedCampaign = selectedDiscount.startsWith("CAMPAIGN:")
    ? preview?.availableCampaigns.find((campaign) => campaign.id === selectedDiscount.replace("CAMPAIGN:", ""))
    : undefined;
  const displayDiscount = selectedReward?.discountAmount ?? selectedCampaign?.discountAmount ?? 0;
  const displayNetAmount = preview ? Math.max(0, preview.grossAmount - displayDiscount) : 0;
  const displayExpectedPoints = Math.floor(displayNetAmount);

  return (
    <form onSubmit={submitPreview} className="space-y-4">
      <div className="rounded-lg border border-salon-line bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">الخدمات</h2>
        <div className="mt-3 grid gap-2">
          {services.map((service) => (
            <label
              key={service.id}
              className={`flex min-h-16 items-center justify-between rounded-lg border px-3 py-3 ${
                selectedServices.includes(service.id) ? "border-salon-gold bg-salon-gold/15" : "border-salon-line bg-white"
              }`}
            >
              <span className="font-bold">
                <input
                  type="checkbox"
                  checked={selectedServices.includes(service.id)}
                  onChange={() => toggleService(service.id)}
                  className="ml-2"
                />
                {service.name}
              </span>
              <span className="font-bold">{service.defaultPrice} ريال</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-salon-line bg-white p-4 shadow-sm">
        <label className="block text-sm font-bold">
          المبلغ قبل الخصم
          <input
            value={grossAmount}
            onChange={(event) => {
              setGrossAmount(event.target.value);
              setPreview(null);
              setSelectedDiscount("NONE");
            }}
            required
            type="number"
            min={0.01}
            step="0.01"
            placeholder="0"
            className="mt-2 h-16 w-full rounded-md border border-salon-line px-3 text-center text-3xl font-bold outline-none focus:border-salon-gold"
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setPaymentMethod("CASH");
              setPreview(null);
              setSelectedDiscount("NONE");
            }}
            className={`h-14 rounded-md border px-3 text-lg font-bold ${paymentMethod === "CASH" ? "border-salon-gold bg-salon-gold text-salon-ink" : "border-salon-line bg-white"}`}
          >
            كاش
          </button>
          <button
            type="button"
            onClick={() => {
              setPaymentMethod("NETWORK");
              setPreview(null);
              setSelectedDiscount("NONE");
            }}
            className={`h-14 rounded-md border px-3 text-lg font-bold ${paymentMethod === "NETWORK" ? "border-salon-gold bg-salon-gold text-salon-ink" : "border-salon-line bg-white"}`}
          >
            شبكة
          </button>
        </div>
      </div>

      {message ? <p className="rounded-md bg-white px-3 py-3 text-sm text-salon-charcoal">{message}</p> : null}

      <button disabled={loadingPreview} className="h-14 w-full rounded-md bg-salon-ink px-4 text-lg font-bold text-white disabled:opacity-60">
        {loadingPreview ? "جاري المعاينة..." : "معاينة العملية"}
      </button>

      {preview ? (
        <div className="rounded-lg border border-salon-line bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">ملخص العملية</h2>
          <div className="mt-3 rounded-lg bg-salon-ink p-4 text-center text-white">
            <p className="text-sm text-white/70">المطلوب تحصيله</p>
            <p className="mt-1 text-4xl font-bold text-salon-gold">{displayNetAmount} ريال</p>
            <p className="mt-1 text-sm text-white/70">النقاط المتوقعة: {displayExpectedPoints}</p>
          </div>
          <div className="mt-3 rounded-md bg-salon-mist p-3">
            <p className="text-sm font-bold">رصيد النقاط: {preview.pointsBalance}</p>
            <label className="mt-3 block text-sm font-semibold">
              الخصومات المتاحة
              <select
                value={selectedDiscount}
                onChange={(event) => setSelectedDiscount(event.target.value)}
                className="mt-2 h-12 w-full rounded-md border border-salon-line bg-white px-3 outline-none focus:border-salon-gold"
              >
                <option value="NONE">بدون خصم</option>
                {preview.availableRewards.map((reward) => (
                  <option key={reward.id} value={`REWARD:${reward.id}`}>
                    {reward.label}
                  </option>
                ))}
                {preview.availableCampaigns.map((campaign) => (
                  <option key={campaign.id} value={`CAMPAIGN:${campaign.id}`}>
                    {campaign.label}
                  </option>
                ))}
              </select>
            </label>
            {preview.availableRewards.length === 0 && preview.availableCampaigns.length === 0 ? (
              <p className="mt-2 text-xs text-salon-charcoal">لا توجد خصومات متاحة لهذه الزيارة</p>
            ) : null}
            {selectedCampaign ? <p className="mt-2 text-xs text-salon-charcoal">{selectedCampaign.description ?? selectedCampaign.name}</p> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-salon-charcoal">العميل</dt><dd className="font-bold">{preview.customer.name}</dd></div>
            <div><dt className="text-salon-charcoal">الحلاق</dt><dd className="font-bold">{preview.barber.name}</dd></div>
            <div><dt className="text-salon-charcoal">قبل الخصم</dt><dd className="font-bold">{preview.grossAmount} ريال</dd></div>
            <div><dt className="text-salon-charcoal">الخصم</dt><dd className="font-bold">{displayDiscount} ريال</dd></div>
            <div><dt className="text-salon-charcoal">المطلوب</dt><dd className="font-bold">{displayNetAmount} ريال</dd></div>
            <div><dt className="text-salon-charcoal">النقاط المستخدمة</dt><dd className="font-bold">{selectedReward?.pointsRequired ?? 0}</dd></div>
            <div><dt className="text-salon-charcoal">النقاط المتوقعة</dt><dd className="font-bold">{displayExpectedPoints}</dd></div>
          </dl>
          <p className="mt-3 text-sm text-salon-charcoal">{preview.services.map((service) => service.name).join("، ")}</p>
          <button
            type="button"
            onClick={confirmVisit}
            disabled={loadingConfirm}
            className="mt-4 h-14 w-full rounded-md bg-salon-gold px-4 text-lg font-bold text-salon-ink disabled:opacity-60"
          >
            {loadingConfirm ? "جاري الحفظ..." : "تأكيد وإغلاق"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
