"use client";

import { FormEvent, useCallback, useState } from "react";
import { ShareReceiptPdfButton } from "@/components/receipt/share-pdf-button";
import { FeedbackNote, useFeedback } from "@/components/ui/toast";
import { useModalDismiss } from "@/components/use-modal-dismiss";
import { calculateVisitTotals } from "@/lib/loyalty/calculations";
import { formatDate } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";

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
  customer: { id: string; name: string; phone: string } | null;
  barber: { id: string; name: string };
  services: ServiceOption[];
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentMethod: "CASH" | "NETWORK";
  loyaltyEnabled: boolean;
  expectedPointsEarned: number;
  pointsBalance: number;
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
  customerId?: string | null;
  services: ServiceOption[];
  products?: ProductOption[];
}) {
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(customerId ?? null);
  const [linkedCustomer, setLinkedCustomer] = useState<{ id: string; name: string; phone: string; loyaltyEnabled: boolean; pointsBalance: number } | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerLookupState, setCustomerLookupState] = useState<"idle" | "missing">("idle");
  const [joinName, setJoinName] = useState("");
  const [transactionalConsent, setTransactionalConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  // ربط العميل يعلن نتيجته بنبرة: «تم ربط أحمد — 40 نقطة» و«تعذر البحث عن
  // العميل» كانتا تُرسمان في الشريحة الرمادية نفسها.
  const { feedback: customerFeedback, setFeedback: setCustomerFeedback } = useFeedback();
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  // كمية كل منتج مباع مع الزيارة؛ الأسعار تُحسب في الخادم لا هنا.
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "NETWORK">("CASH");
  const [preview, setPreview] = useState<VisitPreview | null>(null);
  const [selectedDiscount, setSelectedDiscount] = useState("NONE");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  // `feedback` بنبرة لا نصًّا مجرّدًا: كان الفشل والنجاح يُرسمان بالصندوق الرمادي نفسه.
  const { feedback, fail: failFeedback, clear: clearFeedback } = useFeedback();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [confirmedVisitId, setConfirmedVisitId] = useState<string | null>(null);
  const [cashTenderedAmount, setCashTenderedAmount] = useState("");
  const [networkAccepted, setNetworkAccepted] = useState(false);

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

  async function lookupCustomer() {
    if (!/^05\d{8}$/.test(customerPhone)) {
      setCustomerFeedback({ message: "أدخل رقمًا يبدأ بـ 05 ويتكون من 10 أرقام", tone: "warning" });
      return;
    }
    setLoadingCustomer(true);
    setCustomerFeedback(null);
    const response = await safeFetch(`/api/barber/customers/search?phone=${encodeURIComponent(customerPhone)}`);
    const data = (await response.json().catch(() => ({}))) as {
      found?: boolean;
      customer?: { id: string; name: string; phone: string; loyaltyEnabled: boolean; pointsBalance: number };
      message?: string;
    };
    if (response.ok && data.found && data.customer) {
      setLinkedCustomer(data.customer);
      setLinkedCustomerId(data.customer.id);
      setCustomerLookupState("idle");
      setCustomerFeedback({
        message: data.customer.loyaltyEnabled
          ? `تم ربط ${data.customer.name} — ${data.customer.pointsBalance} نقطة`
          : `تم ربط ${data.customer.name} كعميل عادي`,
        tone: "success",
      });
      setPreview(null);
    } else if (response.ok) {
      setLinkedCustomer(null);
      setLinkedCustomerId(null);
      setCustomerLookupState("missing");
      setCustomerFeedback({ message: "الرقم غير مسجل. احفظ العميل باسمه أو تابع كزائر دون حفظه.", tone: "info" });
    } else {
      setCustomerFeedback({ message: data.message ?? "تعذر البحث عن العميل", tone: "error" });
    }
    setLoadingCustomer(false);
  }

  // حفظ سجل تشغيلي فقط — **بلا عضوية ولاء**. العضوية يفتحها العميل بنفسه من
  // رمز الصالون بحساب بريده موثَّق، فلا تُفتح باسمه بيد غيره.
  async function saveCustomer() {
    if (joinName.trim().length < 2) {
      setCustomerFeedback({ message: "اكتب اسم العميل لحفظه", tone: "warning" });
      return;
    }
    setLoadingCustomer(true);
    const response = await safeFetch("/api/barber/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: joinName,
        phone: customerPhone,
        whatsappTransactionalOptIn: transactionalConsent,
        whatsappMarketingOptIn: marketingConsent,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      customer?: { id: string; name: string; phone: string; loyaltyEnabled: boolean; pointsBalance: number };
      message?: string;
    };
    if (response.ok && data.customer) {
      setLinkedCustomer(data.customer);
      setLinkedCustomerId(data.customer.id);
      setCustomerLookupState("idle");
      setCustomerFeedback({ message: "تم حفظ العميل وربطه بالعملية", tone: "success" });
      setPreview(null);
    } else {
      setCustomerFeedback({ message: data.message ?? "تعذر حفظ العميل", tone: "error" });
    }
    setLoadingCustomer(false);
  }

  function continueAsGuest() {
    setLinkedCustomer(null);
    setLinkedCustomerId(null);
    setCustomerPhone("");
    setJoinName("");
    setCustomerLookupState("idle");
    setCustomerFeedback({ message: "ستُحفظ العملية كزائر بلا اسم أو رقم جوال أو نقاط", tone: "info" });
    setPreview(null);
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setLoadingPreview(true);

    // بلا `try` كان انقطاع الشبكة — وهو أكثر ما يحدث بيد الحلاق — يرمي الوعد
    // فلا يُطفأ `loading` ولا تظهر رسالة: الزر يبقى «جاري المعاينة...» إلى الأبد.
    try {
      const response = await safeFetch("/api/barber/visits/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: linkedCustomerId,
          serviceIds: selectedServices,
          products: selectedProducts,
          grossAmount,
          paymentMethod,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { preview?: VisitPreview; message?: string };

      if (response.ok && data.preview) {
        setPreview(data.preview);
        setCashTenderedAmount(String(data.preview.netAmount));
        setNetworkAccepted(false);
        setSelectedDiscount("NONE");
        setIdempotencyKey(crypto.randomUUID());
      } else {
        failFeedback(data.message ?? "تعذر حساب المعاينة");
      }
    } catch {
      failFeedback("انقطع الاتصال قبل حساب المعاينة — تحقق من الشبكة وأعد المحاولة");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmVisit() {
    clearFeedback();
    setLoadingConfirm(true);

    try {
      const response = await safeFetch("/api/barber/visits/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: linkedCustomerId,
          serviceIds: selectedServices,
          products: selectedProducts,
          grossAmount,
          paymentMethod,
          rewardRuleId: selectedDiscount.startsWith("REWARD:") ? selectedDiscount.replace("REWARD:", "") : undefined,
          managerRewardId: selectedDiscount.startsWith("MANAGER_REWARD:") ? selectedDiscount.replace("MANAGER_REWARD:", "") : undefined,
          campaignId: selectedDiscount.startsWith("CAMPAIGN:") ? selectedDiscount.replace("CAMPAIGN:", "") : undefined,
          idempotencyKey,
          paymentConfirmed: true,
          cashTenderedAmount: paymentMethod === "CASH" ? cashTenderedAmount : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { visit?: { id: string; customer: { id: string } | null }; message?: string };

      if (response.ok && data.visit) {
        // لا نعود للرئيسية مباشرة: الحلاق يحتاج خيار تسليم الإيصال للعميل أولًا.
        setConfirmedVisitId(data.visit.id);
        return;
      }

      failFeedback(data.message ?? "تعذر حفظ الزيارة");
    } catch {
      // المفتاح `idempotencyKey` باقٍ كما هو، فإعادة المحاولة لا تكرّر الزيارة
      // إن كانت قد وصلت الخادم فعلًا. نقول ذلك صراحةً حتى لا يتردد الحلاق.
      failFeedback("انقطع الاتصال قبل تأكيد العملية — تحقق من الشبكة وأعد المحاولة، ولن تتكرر الزيارة");
    } finally {
      setLoadingConfirm(false);
    }
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
      })
    : null;
  const displayNetAmount = displayTotals?.netAmount ?? 0;
  const displayExpectedPoints = preview?.loyaltyEnabled ? (displayTotals?.pointsEarned ?? 0) : 0;
  const parsedCashTendered = Number(cashTenderedAmount);
  const cashChange = Number.isFinite(parsedCashTendered) ? Math.max(0, Math.round((parsedCashTendered - displayNetAmount) * 100) / 100) : 0;
  const paymentReady = paymentMethod === "NETWORK" ? networkAccepted : Number.isFinite(parsedCashTendered) && parsedCashTendered >= displayNetAmount;
  // مبالغ جاهزة للضغط: المبلغ بالضبط ثم أقرب ورقة نقدية أعلى منه — أسرع من
  // كتابة رقم بيد واحدة والمقص في الأخرى.
  const tenderOptions = [...new Set(
    [displayNetAmount, 10, 50, 100, 500]
      .map((step, index) => (index === 0 ? step : Math.ceil(displayNetAmount / step) * step))
      .filter((value) => Number.isFinite(value) && value >= displayNetAmount && value > 0),
  )].slice(0, 4);
  const selectedServicesTotal = services
    .filter((service) => selectedServices.includes(service.id))
    .reduce((total, service) => total + service.defaultPrice, 0);
  const grossAmount = selectedServicesTotal;
  const productsSubtotal = products.reduce(
    (total, product) => total + product.price * (productQuantities[product.id] ?? 0),
    0,
  );
  const canPreview = selectedServices.length > 0 && grossAmount > 0 && !loadingPreview;

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
        {paymentMethod === "CASH" && cashChange > 0 ? (
          <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950">
            سلّم العميل الباقي: <span className="font-black tabular-nums">{cashChange.toFixed(2)} ريال</span>
          </p>
        ) : null}

        <div className="mt-6 grid gap-3">
          <ShareReceiptPdfButton
            visitId={confirmedVisitId}
            className="barber-primary-button block w-full py-4 text-center text-lg"
          />
          <a href={`/receipt/${confirmedVisitId}`} className="barber-primary-button block py-4 text-center text-lg">
            عرض الإيصال وطباعته
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

      <section className="barber-card overflow-hidden">
        <div className="barber-card-head flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-salon-forest">قبل الدفع · اختياري</p>
            <h2 className="mt-1 text-lg font-bold">العميل</h2>
          </div>
          <span className="rounded-xl border border-salon-line bg-white px-3 py-1 text-xs font-bold text-salon-charcoal">
            {linkedCustomerId ? "عميل مرتبط" : "زائر"}
          </span>
        </div>
        <div className="space-y-3 p-4">
          {linkedCustomerId ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-violet-950">{linkedCustomer?.name ?? "العميل المحدد"}</p>
                  <p className="mt-1 text-xs font-semibold text-violet-800/75">
                    {linkedCustomer
                      ? linkedCustomer.loyaltyEnabled
                        ? `${linkedCustomer.phone} · ${linkedCustomer.pointsBalance} نقطة`
                        : `${linkedCustomer.phone} · غير مشترك في الولاء`
                      : "سيتم التحقق من الرصيد والمكافآت في المعاينة"}
                  </p>
                </div>
                <button type="button" onClick={continueAsGuest} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900">
                  تحويل لزائر
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
                <p className="text-sm font-bold">الافتراضي: عملية زائر بلا بيانات</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-salon-charcoal/65">
                  أدخل الجوال فقط إذا أراد العميل احتساب نقاطه أو استبدال مكافأة. الرقم غير المسجل لا يُحفظ عند المتابعة كزائر.
                </p>
              </div>
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <input
                  value={customerPhone}
                  onChange={(event) => {
                    setCustomerPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
                    setCustomerLookupState("idle");
                    setCustomerFeedback(null);
                  }}
                  inputMode="numeric"
                  placeholder="05xxxxxxxx"
                  className="barber-field h-14 text-center text-lg"
                />
                <button type="button" onClick={lookupCustomer} disabled={loadingCustomer} className="barber-ghost-button h-14">
                  {loadingCustomer ? "..." : "تحقق"}
                </button>
              </div>
            </>
          )}

          {customerLookupState === "missing" ? (
            <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
              <input value={joinName} onChange={(event) => setJoinName(event.target.value)} placeholder="اسم العميل" className="barber-field bg-white" />
              <div className="grid gap-2 text-xs font-semibold text-violet-950 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5">
                  <input type="checkbox" checked={transactionalConsent} onChange={(event) => setTransactionalConsent(event.target.checked)} />
                  رسائل الخدمة والمواعيد
                </label>
                <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5">
                  <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
                  العروض والمكافآت
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={saveCustomer} disabled={loadingCustomer} className="barber-gold-button h-12">حفظ العميل</button>
                <button type="button" onClick={continueAsGuest} className="barber-ghost-button h-12">متابعة كزائر</button>
              </div>
            </div>
          ) : null}

          <FeedbackNote feedback={customerFeedback} />
        </div>
      </section>

      <div className="barber-card p-4">
        <div className="rounded-2xl border border-salon-forest/20 bg-salon-forest/5 px-4 py-4 text-center">
          <p className="text-xs font-bold text-salon-charcoal/70">مبلغ الخدمات — محسوب آليًا من قائمة الأسعار</p>
          <p className="mt-1 text-4xl font-black tabular-nums text-salon-forest">{grossAmount.toFixed(2)} <span className="text-base">ريال</span></p>
          <p className="mt-2 text-xs font-semibold text-salon-charcoal/60">أي تصحيح استثنائي ينفذه المالك أو المدير فقط مع سبب موثق في سجل التدقيق.</p>
        </div>
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

      {/* ملاحظة النموذج تخصّ المعاينة وحدها. خطأ التأكيد يُرسم داخل النافذة
          نفسها — انظر التذييل أدناه — لأن هذه الفقرة تقع خلف طبقتها. */}
      {!preview ? <FeedbackNote feedback={feedback} /> : null}

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
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-salon-ink/35 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:pt-4" role="dialog" aria-modal="true" aria-label="معاينة العملية">
          <button
            type="button"
            aria-label="إغلاق المعاينة"
            className="absolute inset-0 cursor-default"
            onClick={closePreview}
          />
          <div className="barber-card relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden shadow-[0_28px_70px_-24px_rgba(16,25,22,0.45)]">
            {/* الترويسة تحمل قرار الدفع نفسه: حقل الاستلام وحاسبة الباقي كانا أسفل
                منطقة تمرير النافذة، فيضغط الحلاق «إتمام» على جوال ولا يرى سبب
                التعطيل ولا الباقي الذي يجب أن يعيده. القرار الآن فوق الطية دائمًا. */}
            {/* الترويسة والتذييل ثابتان والوسط وحده يتمرّر: بلا `shrink-0` كان
                flex يضغط الترويسة فيقصّ حقل الاستلام نفسه الذي رفعناه إليها. */}
            <div className="barber-card-head lux-edge shrink-0">
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
              <p className="lux-eyebrow mt-4">المطلوب تحصيله</p>
              <p className="lux-number mt-1 text-5xl text-salon-forest">{displayNetAmount} ريال</p>
              <p className="mt-1.5 text-sm font-semibold text-salon-charcoal/70">
                {preview.customer?.name ?? "عميل زائر"}
                {preview.loyaltyEnabled ? ` · النقاط المتوقعة ${displayExpectedPoints}` : " · بلا نقاط ولاء"}
              </p>

              {paymentMethod === "CASH" ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-emerald-950">المبلغ المستلم من العميل</span>
                    <span className="text-[0.7rem] font-bold text-emerald-800/75">اضغط مبلغًا جاهزًا أو اكتبه</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {tenderOptions.map((value) => {
                      const active = Number(cashTenderedAmount) === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setCashTenderedAmount(String(value))}
                          className={`h-11 rounded-xl border text-sm font-bold tabular-nums transition active:scale-[0.97] ${
                            active
                              ? "border-salon-forest bg-salon-forest text-white shadow-sm"
                              : "border-emerald-200 bg-white text-emerald-950"
                          }`}
                        >
                          {value === displayNetAmount ? "بالضبط" : value}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    lang="en"
                    dir="ltr"
                    type="number"
                    min={displayNetAmount}
                    step="0.01"
                    inputMode="decimal"
                    aria-label="المبلغ المستلم من العميل"
                    value={cashTenderedAmount}
                    onChange={(event) => setCashTenderedAmount(event.target.value)}
                    className="barber-field mt-2 h-12 bg-white text-center text-xl"
                  />
                  <div
                    className={`mt-2 flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                      cashChange > 0 ? "bg-salon-gold/20 text-salon-ink" : "bg-white text-emerald-950"
                    }`}
                  >
                    <span>{cashChange > 0 ? "الباقي للعميل" : "بلا باقٍ"}</span>
                    <span className="lux-number text-xl">{cashChange.toFixed(2)} ريال</span>
                  </div>
                </div>
              ) : (
                <label
                  className={`mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-bold transition ${
                    networkAccepted
                      ? "border-salon-forest bg-salon-forest text-white shadow-sm"
                      : "border-sky-200 bg-sky-50 text-sky-950"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={networkAccepted}
                    onChange={(event) => setNetworkAccepted(event.target.checked)}
                    className="h-6 w-6 shrink-0 accent-sky-700"
                  />
                  <span className="min-w-0">
                    <span className="block">أؤكد أن جهاز الشبكة وافق وتم تحصيل المبلغ</span>
                    <span className={`mt-0.5 block text-xs font-semibold ${networkAccepted ? "text-white/75" : "text-sky-900/70"}`}>
                      {networkAccepted ? "جاهز للإتمام" : "مطلوب قبل إتمام العملية"}
                    </span>
                  </span>
                </label>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
                <p className="text-sm font-bold">الخصومات المتاحة</p>
                <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">
                  {preview.loyaltyEnabled ? `رصيد النقاط: ${preview.pointsBalance}` : "العميل غير مشترك في برنامج الولاء"}
                </p>
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
                <SummaryCell label="العميل" value={preview.customer?.name ?? "عميل زائر"} />
                <SummaryCell label="طريقة الدفع" value={paymentMethod === "CASH" ? "كاش" : "شبكة"} />
                <SummaryCell label="قبل الخصم" value={`${preview.grossAmount} ريال`} />
                <SummaryCell label="الخصم" value={`${displayDiscount} ريال`} />
                <SummaryCell label="المطلوب" value={`${displayNetAmount} ريال`} strong />
                <SummaryCell label="النقاط المستخدمة" value={`${selectedReward?.pointsRequired ?? 0}`} />
                <SummaryCell label="مكافأة الإدارة" value={selectedManagerReward ? selectedManagerReward.title : "-"} />
              </dl>
              <p className="mt-3 rounded-2xl bg-salon-mist px-3 py-3 text-sm font-semibold text-salon-charcoal">{preview.services.map((service) => service.name).join("، ")}</p>
            </div>
            <div className="shrink-0 border-t border-salon-line bg-white p-4">
              {/* **سبب وجود هذه الفقرة هنا:** رسالة الفشل كانت تُرسم في جسم
                  النموذج، والنافذة `z-[100]` فوقه تغطّيها. فيضغط الحلاق «إتمام
                  العملية»، ترجع الزيارة مرفوضة، ولا يظهر شيء إطلاقًا — يسلّم
                  الباقي ويمضي وهو يظنّ العملية محفوظة. الرسالة الآن فوق الزر
                  الذي ضغطه مباشرة. */}
              <FeedbackNote feedback={feedback} className="mb-3" />
              <button
                type="button"
                onClick={confirmVisit}
                disabled={loadingConfirm || !paymentReady}
                aria-busy={loadingConfirm}
                className="barber-gold-button h-14 w-full text-lg"
              >
                {loadingConfirm ? "جاري إتمام العملية..." : paymentMethod === "CASH" ? "تم استلام الكاش — إتمام العملية" : "تم قبول الشبكة — إتمام العملية"}
              </button>
              {/* زر معطّل بلا سبب يقرأ كعطل. السبب يُكتب تحته دائمًا. */}
              {!paymentReady && !loadingConfirm ? (
                <p role="status" className="mt-2 text-center text-xs font-bold text-salon-ruby">
                  {paymentMethod === "CASH"
                    ? `اكتب المبلغ المستلم أولًا (${displayNetAmount} ريال فأكثر)`
                    : "علّم إقرار قبول جهاز الشبكة أعلاه أولًا"}
                </p>
              ) : null}
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
