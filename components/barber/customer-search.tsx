"use client";

import { formatDate, formatNumber } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FeedbackNote, useFeedback } from "@/components/ui/toast";
import { useModalDismiss } from "@/components/use-modal-dismiss";
type CustomerSummary = {
  id: string;
  name: string;
  phone: string;
  loyaltyEnabled: boolean;
  pointsBalance: number;
  visitsCount: number;
  lastVisitAt: string | null;
  lastBarberName: string | null;
  lastServices: string[];
};

export function CustomerSearch() {
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [notFoundPhone, setNotFoundPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [transactionalConsent, setTransactionalConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  // «العميل غير موجود» إرشاد، و«تعذر البحث» فشل، و«تم» تأكيد — وكانت الثلاثة
  // تُرسم في الشريحة الرمادية نفسها.
  const { feedback, setFeedback, clear: clearFeedback } = useFeedback();
  const [loading, setLoading] = useState(false);
  const sheetOpen = Boolean(customer || notFoundPhone);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // اختصار «بحث عميل» في التطبيق المثبّت يفتح `/barber?action=search`.
  // نقرأ الاستعلام من `window` لا عبر `useSearchParams` حتى لا نُدخل حدّ Suspense
  // في شاشة يجب أن تُرسم فورًا. تركيز الحقل يفتح لوحة الأرقام مباشرة.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("action") !== "search") return;
    phoneInputRef.current?.focus();
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const localPhone = phone;

    if (!/^05\d{8}$/.test(localPhone)) {
      setFeedback({ message: "رقم جوال العميل يجب أن يبدأ بـ 05 ويتكون من 10 أرقام", tone: "warning" });
      return;
    }

    setLoading(true);
    clearFeedback();
    setCustomer(null);
    setNotFoundPhone("");

    const response = await safeFetch(`/api/barber/customers/search?phone=${encodeURIComponent(localPhone)}`);
    const data = (await response.json().catch(() => ({}))) as {
      found?: boolean;
      phone?: string;
      customer?: CustomerSummary;
      message?: string;
    };

    if (!response.ok) {
      setFeedback({ message: data.message ?? "تعذر البحث عن العميل", tone: "error" });
    } else if (data.found && data.customer) {
      setCustomer(data.customer);
    } else {
      setNotFoundPhone(data.phone ?? localPhone);
      setFeedback({ message: "العميل غير موجود، يمكنك إضافته الآن", tone: "info" });
    }
    setLoading(false);
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^05\d{8}$/.test(notFoundPhone)) {
      setFeedback({ message: "رقم جوال العميل يجب أن يبدأ بـ 05 ويتكون من 10 أرقام", tone: "warning" });
      return;
    }

    setLoading(true);
    clearFeedback();

    const response = await safeFetch("/api/barber/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        phone: notFoundPhone,
        whatsappTransactionalOptIn: transactionalConsent,
        whatsappMarketingOptIn: marketingConsent,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { customer?: CustomerSummary; message?: string };

    if (response.ok && data.customer) {
      window.location.href = `/barber/customers/${data.customer.id}/visits/new`;
      return;
    }

    setFeedback({ message: data.message ?? "تعذر إنشاء العميل", tone: "error" });
    setLoading(false);
  }

  const closeSheet = useCallback(() => {
    setCustomer(null);
    setNotFoundPhone("");
    setNewName("");
    setTransactionalConsent(false);
    setMarketingConsent(false);
    clearFeedback();
  }, [clearFeedback]);

  useModalDismiss(sheetOpen, closeSheet);

  return (
    <div>
      <form onSubmit={search} className="barber-card overflow-hidden">
        <div className="barber-card-head">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-salon-forest">ابدأ من هنا</p>
              <h2 className="mt-1 text-xl font-bold">بحث العميل</h2>
            </div>
            <span className="rounded-full border border-salon-line bg-white px-3 py-1 text-xs font-bold text-salon-forest">سريع</span>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <label className="block text-sm font-bold">
            رقم جوال العميل
            <input
              ref={phoneInputRef}
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
                clearFeedback();
              }}
              inputMode="numeric"
              required
              minLength={10}
              maxLength={10}
              pattern="05[0-9]{8}"
              placeholder="05xxxxxxxx"
              className="barber-field mt-2 h-16 bg-salon-pearl text-center text-2xl"
            />
          </label>
          {!sheetOpen ? <FeedbackNote feedback={feedback} /> : null}
          <button disabled={loading} aria-busy={loading} className="barber-primary-button h-14 w-full text-lg">
            {loading ? "جاري البحث..." : "بحث وفتح الإجراء"}
          </button>
        </div>
      </form>

      {/* `z-[100]` كبقية نوافذ الحلاق (تأكيد العملية، نقل الموعد): الورقة تنزل
          إلى حافة الشاشة حيث يقف شريط التبويبات، وعند `z-40` كان الشريط يغطّي
          زرّي «تسجيل زيارة» و«الملف». */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-salon-ink/35 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:pt-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 cursor-default" onClick={closeSheet} />
          <div className="barber-card relative mx-auto w-full max-w-md overflow-hidden shadow-[0_28px_70px_-24px_rgba(16,25,22,0.45)]">
            <div className="barber-card-head flex items-center justify-between gap-3 py-3">
              <div className="h-1.5 w-12 rounded-full bg-salon-line" />
              <button type="button" onClick={closeSheet} className="min-h-11 rounded-full border border-salon-line bg-white px-4 text-sm font-bold text-salon-charcoal">
                إغلاق
              </button>
            </div>

            <FeedbackNote feedback={feedback} className="mx-4 mt-4" />

            {customer ? (
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-salon-forest">تم العثور على العميل</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${customer.loyaltyEnabled ? "border-violet-200 bg-violet-50 text-violet-700" : "border-salon-line bg-salon-mist text-salon-charcoal"}`}>
                    {customer.loyaltyEnabled ? "مشترك في الولاء" : "عميل عادي"}
                  </span>
                </div>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-3xl font-bold text-salon-ink">{customer.name}</h2>
                    <p className="mt-1 font-semibold text-salon-charcoal/75">{customer.phone}</p>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 text-center ${customer.loyaltyEnabled ? "border-salon-gold/40 bg-salon-gold/10" : "border-salon-line bg-salon-mist"}`}>
                    <p className="text-xs font-bold text-salon-charcoal/65">{customer.loyaltyEnabled ? "النقاط" : "الولاء"}</p>
                    <p className={`${customer.loyaltyEnabled ? "text-2xl" : "mt-1 text-xs"} font-black text-salon-forest`}>
                      {customer.loyaltyEnabled ? customer.pointsBalance : "غير مشترك"}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <InfoTile label="الزيارات" value={formatNumber(customer.visitsCount)} />
                  <InfoTile label="آخر حلاق" value={customer.lastBarberName ?? "-"} />
                  <InfoTile label="آخر خدمة" value={customer.lastServices.join("، ") || "-"} />
                  <InfoTile label="آخر زيارة" value={customer.lastVisitAt ? formatDate(customer.lastVisitAt) : "-"} />
                </dl>
                <div className="mt-4 grid grid-cols-[1fr_112px] gap-2">
                  <Link href={`/barber/customers/${customer.id}/visits/new`} className="barber-gold-button h-14 py-4 text-center text-lg">
                    تسجيل زيارة
                  </Link>
                  <Link href={`/barber/customers/${customer.id}`} className="barber-ghost-button h-14 py-4 text-center">
                    الملف
                  </Link>
                </div>
              </div>
            ) : null}

            {notFoundPhone ? (
              <form onSubmit={createCustomer} className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-bold text-salon-forest">عميل جديد</p>
                  <h2 className="mt-1 text-2xl font-bold">تسجيل العملية لعميل جديد</h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-salon-charcoal/70">
                    أضف الاسم ثم تابع للعملية مباشرة.
                  </p>
                </div>
                <input value={notFoundPhone} readOnly className="barber-field h-12 bg-salon-mist" />
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  required
                  placeholder="اسم العميل"
                  className="barber-field h-14 text-lg"
                />
                {/* لا خيار «إضافة إلى الولاء» هنا: العضوية يفتحها العميل بنفسه
                    من رمز الصالون بحساب بريده موثَّق، فلا تُفتح باسمه بيد غيره. */}
                <p className="rounded-2xl border border-salon-line bg-salon-mist px-3.5 py-3 text-[11px] font-semibold leading-5 text-salon-charcoal/75">
                  هذا سجل تشغيلي لتسجيل الزيارة. للانضمام لبرنامج الولاء يمسح العميل رمز الصالون
                  ويسجّل نفسه بنفسه.
                </p>
                <div className="space-y-2 rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
                  <p className="text-xs font-bold text-violet-900">اسأل العميل وحدد موافقته</p>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm font-bold">
                    <input type="checkbox" checked={transactionalConsent} onChange={(event) => setTransactionalConsent(event.target.checked)} className="h-4 w-4 accent-violet-600" />
                    رسائل المواعيد والخدمة
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm font-bold">
                    <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="h-4 w-4 accent-violet-600" />
                    العروض التسويقية والمكافآت
                  </label>
                  <p className="text-[11px] leading-5 text-slate-500">لا تفعّل أي خيار دون موافقة العميل الصريحة.</p>
                </div>
                <button disabled={loading} aria-busy={loading} className="barber-gold-button h-14 w-full text-lg">
                  {loading ? "جاري الحفظ..." : "حفظ العميل وفتح العملية"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
      <dt className="text-xs font-bold text-salon-charcoal/65">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold">{value}</dd>
    </div>
  );
}
