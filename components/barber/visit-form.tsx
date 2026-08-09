"use client";

import { FormEvent, useCallback, useState } from "react";
import { useModalDismiss } from "@/components/use-modal-dismiss";
import { calculateVisitTotals } from "@/lib/loyalty/calculations";
import { formatDate } from "@/lib/format";

type ServiceOption = {
  id: string;
  name: string;
  defaultPrice: number;
};

type ProductOption = {
  id: string;
  name: string;
  price: number;
  stockQuantity: number;
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
  vatEnabled: boolean;
  vatRate: number;
  vatInclusive: boolean;
  pointsPerCurrencyUnit: number;
  pointsCalculatedAfterDiscount: boolean;
  productsTotal: number;
  servicesAmount: number;
  availableRewards: Array<{
    id: string;
    pointsRequired: number;
    discountAmount: number;
    label: string;
  }>;
  availableManagerRewards: Array<{
    id: string;
    title: string;
    description: string | null;
    discountAmount: number;
    expiresAt: string | null;
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

export function VisitForm({
  customerId,
  services,
  products = [],
}: {
  customerId: string;
  services: ServiceOption[];
  products?: ProductOption[];
}) {
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  // كمية كل منتج مباع مع الزيارة؛ الأسعار تُحسب في الخادم لا هنا.
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [grossAmount, setGrossAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "NETWORK">("CASH");
  const [preview, setPreview] = useState<VisitPreview | null>(null);
  const [selectedDiscount, setSelectedDiscount] = useState("NONE");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [confirmedVisitId, setConfirmedVisitId] = useState<string | null>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
    setSelectedDiscount("NONE");
  }, []);

  useModalDismiss(Boolean(preview), closePreview);

  function toggleService(id: string) {
    setPreview(null);
    setSelectedDiscount("NONE");
    setSelectedServices((current) => (current.includes(id) ? current.filter((serviceId) => serviceId !== id) : [...current, id]));
  }

  function changeProductQuantity(product: ProductOption, delta: number) {
    setPreview(null);
    setSelectedDiscount("NONE");
    setProductQuantities((current) => {
      const next = Math.max(0, Math.min(product.stockQuantity, (current[product.id] ?? 0) + delta));
      const updated = { ...current, [product.id]: next };
      if (next === 0) delete updated[product.id];
      return updated;
    });
  }

  const selectedProducts = Object.entries(productQuantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));

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
        products: selectedProducts,
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
        products: selectedProducts,
        grossAmount,
        paymentMethod,
        rewardRuleId: selectedDiscount.startsWith("REWARD:") ? selectedDiscount.replace("REWARD:", "") : undefined,
        managerRewardId: selectedDiscount.startsWith("MANAGER_REWARD:") ? selectedDiscount.replace("MANAGER_REWARD:", "") : undefined,
        campaignId: selectedDiscount.startsWith("CAMPAIGN:") ? selectedDiscount.replace("CAMPAIGN:", "") : undefined,
        idempotencyKey,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { visit?: { id: string; customer: { id: string } }; message?: string };

    if (response.ok && data.visit) {
      // لا نعود للرئيسية مباشرة: الحلاق يحتاج خيار تسليم الإيصال للعميل أولًا.
      setConfirmedVisitId(data.visit.id);
      setLoadingConfirm(false);
      return;
    }

    setMessage(data.message ?? "تعذر حفظ الزيارة");
    setLoadingConfirm(false);
  }

  const selectedReward = selectedDiscount.startsWith("REWARD:")
    ? preview?.availableRewards.find((reward) => reward.id === selectedDiscount.replace("REWARD:", ""))
    : undefined;
  const selectedManagerReward = selectedDiscount.startsWith("MANAGER_REWARD:")
    ? preview?.availableManagerRewards.find((reward) => reward.id === selectedDiscount.replace("MANAGER_REWARD:", ""))
    : undefined;
  const selectedCampaign = selectedDiscount.startsWith("CAMPAIGN:")
    ? preview?.availableCampaigns.find((campaign) => campaign.id === selectedDiscount.replace("CAMPAIGN:", ""))
    : undefined;
  const displayDiscount = selectedReward?.discountAmount ?? selectedManagerReward?.discountAmount ?? selectedCampaign?.discountAmount ?? 0;
  // نستدعي دالة الخادم نفسها (نقية، بلا قاعدة بيانات) فلا ينحرف المعروض عن المحفوظ.
  const displayTotals = preview
    ? calculateVisitTotals({
        grossAmount: preview.grossAmount,
        discountAmount: displayDiscount,
        pointsPerCurrencyUnit: preview.pointsPerCurrencyUnit,
        pointsCalculatedAfterDiscount: preview.pointsCalculatedAfterDiscount,
        vatEnabled: preview.vatEnabled,
        vatRate: preview.vatRate,
        vatInclusive: preview.vatInclusive,
      })
    : null;
  const displayNetAmount = displayTotals?.netAmount ?? 0;
  const displayExpectedPoints = displayTotals?.pointsEarned ?? 0;
  const selectedServicesTotal = services
    .filter((service) => selectedServices.includes(service.id))
    .reduce((total, service) => total + service.defaultPrice, 0);
  const productsSubtotal = products.reduce(
    (total, product) => total + product.price * (productQuantities[product.id] ?? 0),
    0,
  );
  const canPreview = selectedServices.length > 0 && Number(grossAmount) > 0 && !loadingPreview;

  if (confirmedVisitId) {
    return (
      <div className="barber-card mt-4 p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-salon-forest/10 text-3xl text-salon-forest">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-bold">تم حفظ الزيارة</h2>
        <p className="mt-2 text-lg font-black text-salon-forest">{displayNetAmount} ريال</p>
        <p className="mt-1 text-sm font-semibold text-salon-charcoal/70">
          {displayExpectedPoints > 0 ? `أضيفت ${displayExpectedPoints} نقطة لرصيد العميل` : "بلا نقاط لهذه الزيارة"}
        </p>

        <div className="mt-6 grid gap-3">
          <a href={`/receipt/${confirmedVisitId}`} className="barber-primary-button block py-4 text-center text-lg">
            عرض وطباعة الإيصال
          </a>
          <a
            href="/barber"
            className="block rounded-2xl border border-salon-line bg-white py-4 text-center text-lg font-bold text-salon-charcoal"
          >
            العودة للرئيسية
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submitPreview} className="space-y-4">
      <div className="barber-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">الخدمات</h2>
            <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">اختر خدمة واحدة أو أكثر</p>
          </div>
          <span className="rounded-full bg-salon-mist px-3 py-1 text-xs font-bold text-salon-charcoal">{selectedServices.length} مختارة</span>
        </div>
        <div className="mt-4 grid gap-2">
          {services.map((service) => (
            <label
              key={service.id}
              className={`flex min-h-16 items-center justify-between rounded-2xl border px-3 py-3 transition active:scale-[0.99] ${
                selectedServices.includes(service.id) ? "border-salon-forest bg-salon-forest/10 shadow-sm shadow-salon-forest/10" : "border-salon-line bg-salon-pearl"
              }`}
            >
              <span className="flex items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  checked={selectedServices.includes(service.id)}
                  onChange={() => toggleService(service.id)}
                  className="h-5 w-5 accent-salon-forest"
                />
                {service.name}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-salon-forest">{service.defaultPrice} ريال</span>
            </label>
          ))}
        </div>
        {selectedServices.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-salon-line bg-salon-pearl px-4 py-3 text-sm font-bold text-salon-charcoal">
            مجموع الأسعار الافتراضية: <span className="text-salon-forest">{selectedServicesTotal} ريال</span>
          </div>
        ) : null}
      </div>

      {products.length > 0 ? (
        <div className="barber-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">منتجات</h2>
              <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">تُضاف بأسعارها فوق مبلغ الخدمات</p>
            </div>
            {productsSubtotal > 0 ? (
              <span className="rounded-full bg-salon-gold/15 px-3 py-1 text-sm font-bold text-salon-forest">
                +{productsSubtotal} ريال
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {products.map((product) => {
              const quantity = productQuantities[product.id] ?? 0;
              return (
                <div
                  key={product.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 ${
                    quantity > 0 ? "border-salon-forest bg-salon-forest/10" : "border-salon-line bg-salon-pearl"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{product.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/70">
                      {product.price} ريال · متوفر {product.stockQuantity}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={`إنقاص ${product.name}`}
                      onClick={() => changeProductQuantity(product, -1)}
                      disabled={quantity === 0}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-salon-line bg-white text-lg font-bold disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-lg font-bold tabular-nums">{quantity}</span>
                    <button
                      type="button"
                      aria-label={`زيادة ${product.name}`}
                      onClick={() => changeProductQuantity(product, 1)}
                      disabled={quantity >= product.stockQuantity}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-salon-line bg-white text-lg font-bold disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="barber-card p-4">
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
            // `inputMode="decimal"` يفتح لوحة أرقام بفاصلة عشرية على iOS —
            // `type="number"` وحده يعطي لوحة بلا فاصلة في بعض اللغات.
            inputMode="decimal"
            min={0.01}
            step="0.01"
            placeholder="0"
            className="barber-field lux-number mt-2 h-20 bg-salon-pearl px-3 text-center text-4xl"
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
            className={`h-14 rounded-2xl border px-3 text-lg font-bold transition active:scale-[0.98] ${paymentMethod === "CASH" ? "border-salon-forest bg-salon-forest text-white shadow-sm shadow-salon-forest/20" : "border-salon-line bg-salon-pearl text-salon-ink"}`}
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
            className={`h-14 rounded-2xl border px-3 text-lg font-bold transition active:scale-[0.98] ${paymentMethod === "NETWORK" ? "border-salon-forest bg-salon-forest text-white shadow-sm shadow-salon-forest/20" : "border-salon-line bg-salon-pearl text-salon-ink"}`}
          >
            شبكة
          </button>
        </div>
      </div>

      {message ? <p className="rounded-2xl border border-salon-line bg-white px-4 py-3 text-sm font-bold text-salon-charcoal shadow-sm">{message}</p> : null}

      {/* الزر لاصق أسفل الشاشة: قائمة الخدمات والمنتجات قد تطول، وكان الحلاق
          يمرّر للأسفل بعد كل تعديل ليصل إلى «معاينة». الآن يبقى تحت إبهامه دائمًا. */}
      <div className="sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-10 pt-1">
        <button
          disabled={!canPreview}
          aria-busy={loadingPreview}
          className="barber-primary-button h-14 w-full text-lg shadow-[0_10px_30px_-10px_rgba(23,59,51,0.55)]"
        >
          {loadingPreview ? "جاري المعاينة..." : "معاينة العملية"}
        </button>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-salon-ink/35 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:pt-4" role="dialog" aria-modal="true" aria-label="معاينة العملية">
          <button
            type="button"
            aria-label="إغلاق المعاينة"
            className="absolute inset-0 cursor-default"
            onClick={closePreview}
          />
          <div className="barber-card relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden shadow-[0_28px_70px_-24px_rgba(16,25,22,0.45)]">
            <div className="barber-card-head">
              <div className="flex items-center justify-between gap-3">
                <div className="h-1.5 w-12 rounded-full bg-salon-line" />
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-full border border-salon-line bg-white px-3 py-1 text-sm font-bold text-salon-charcoal"
                >
                  تعديل
                </button>
              </div>
              <p className="mt-4 text-sm font-bold text-salon-charcoal/65">المطلوب تحصيله</p>
              <p className="mt-1 text-5xl font-black text-salon-forest">{displayNetAmount} ريال</p>
              <p className="mt-2 text-sm font-semibold text-salon-charcoal/70">النقاط المتوقعة: {displayExpectedPoints}</p>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
                <p className="text-sm font-bold">الخصومات المتاحة</p>
                <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">رصيد النقاط: {preview.pointsBalance}</p>
                <div className="mt-3 grid gap-2">
                  <DiscountButton
                    selected={selectedDiscount === "NONE"}
                    title="بدون خصم"
                    subtitle="تحصيل كامل المبلغ"
                    onClick={() => setSelectedDiscount("NONE")}
                  />
                  {preview.availableRewards.map((reward) => (
                    <DiscountButton
                      key={reward.id}
                      selected={selectedDiscount === `REWARD:${reward.id}`}
                      title={reward.label}
                      subtitle={`استخدام ${reward.pointsRequired} نقطة`}
                      onClick={() => setSelectedDiscount(`REWARD:${reward.id}`)}
                    />
                  ))}
                  {preview.availableManagerRewards.map((reward) => (
                    <DiscountButton
                      key={reward.id}
                      selected={selectedDiscount === `MANAGER_REWARD:${reward.id}`}
                      title={reward.label}
                      subtitle={reward.description ?? (reward.expiresAt ? `تنتهي في ${formatDate(reward.expiresAt)}` : "مكافأة من الإدارة")}
                      onClick={() => setSelectedDiscount(`MANAGER_REWARD:${reward.id}`)}
                    />
                  ))}
                  {preview.availableCampaigns.map((campaign) => (
                    <DiscountButton
                      key={campaign.id}
                      selected={selectedDiscount === `CAMPAIGN:${campaign.id}`}
                      title={campaign.label}
                      subtitle={campaign.description ?? campaign.name}
                      onClick={() => setSelectedDiscount(`CAMPAIGN:${campaign.id}`)}
                    />
                  ))}
                </div>
                {preview.availableRewards.length === 0 && preview.availableManagerRewards.length === 0 && preview.availableCampaigns.length === 0 ? (
                  <p className="mt-3 rounded-2xl border border-dashed border-salon-line bg-white px-3 py-2 text-xs font-semibold text-salon-charcoal">لا توجد خصومات متاحة لهذه الزيارة</p>
                ) : null}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <SummaryCell label="العميل" value={preview.customer.name} />
                <SummaryCell label="طريقة الدفع" value={paymentMethod === "CASH" ? "كاش" : "شبكة"} />
                <SummaryCell label="قبل الخصم" value={`${preview.grossAmount} ريال`} />
                <SummaryCell label="الخصم" value={`${displayDiscount} ريال`} />
                <SummaryCell label="المطلوب" value={`${displayNetAmount} ريال`} strong />
                <SummaryCell label="النقاط المستخدمة" value={`${selectedReward?.pointsRequired ?? 0}`} />
                <SummaryCell label="مكافأة الإدارة" value={selectedManagerReward ? selectedManagerReward.title : "-"} />
              </dl>
              <p className="mt-3 rounded-2xl bg-salon-mist px-3 py-3 text-sm font-semibold text-salon-charcoal">{preview.services.map((service) => service.name).join("، ")}</p>
            </div>
            <div className="border-t border-salon-line bg-white p-4">
              <button
                type="button"
                onClick={confirmVisit}
                disabled={loadingConfirm}
                aria-busy={loadingConfirm}
                className="barber-gold-button h-14 w-full text-lg"
              >
                {loadingConfirm ? "جاري الحفظ..." : "تأكيد واستقبال العميل التالي"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function DiscountButton({
  selected,
  title,
  subtitle,
  onClick,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-16 rounded-2xl border px-3 py-3 text-right transition active:scale-[0.99] ${
        selected ? "border-salon-forest bg-salon-forest/10 shadow-sm shadow-salon-forest/10" : "border-salon-line bg-white"
      }`}
    >
      <span className="block text-sm font-bold">{title}</span>
      <span className="mt-1 block text-xs font-semibold text-salon-charcoal/70">{subtitle}</span>
    </button>
  );
}

function SummaryCell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
      <dt className="text-xs font-bold text-salon-charcoal/65">{label}</dt>
      <dd className={`mt-1 break-words text-sm ${strong ? "font-bold text-salon-forest" : "font-bold"}`}>{value}</dd>
    </div>
  );
}
