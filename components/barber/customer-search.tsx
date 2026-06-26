"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";
import { useModalDismiss } from "@/components/use-modal-dismiss";

type CustomerSummary = {
  id: string;
  name: string;
  phone: string;
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
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const sheetOpen = Boolean(customer || notFoundPhone);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const localPhone = toLocalSaudiMobile(phone);

    if (!/^05\d{8}$/.test(localPhone)) {
      setMessage("رقم جوال العميل يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
      return;
    }

    setLoading(true);
    setMessage("");
    setCustomer(null);
    setNotFoundPhone("");

    const response = await fetch(`/api/barber/customers/search?phone=${encodeURIComponent(localPhone)}`);
    const data = (await response.json().catch(() => ({}))) as {
      found?: boolean;
      phone?: string;
      customer?: CustomerSummary;
      message?: string;
    };

    if (!response.ok) {
      setMessage(data.message ?? "تعذر البحث عن العميل");
    } else if (data.found && data.customer) {
      setCustomer(data.customer);
    } else {
      setNotFoundPhone(toLocalSaudiMobile(data.phone ?? localPhone));
      setMessage("العميل غير موجود، يمكنك إضافته الآن");
    }
    setLoading(false);
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^05\d{8}$/.test(notFoundPhone)) {
      setMessage("رقم جوال العميل يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
      return;
    }

    setLoading(true);
    setMessage("");

    const response = await fetch("/api/barber/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, phone: notFoundPhone }),
    });
    const data = (await response.json().catch(() => ({}))) as { customer?: CustomerSummary; message?: string };

    if (response.ok && data.customer) {
      window.location.href = `/barber/customers/${data.customer.id}/visits/new`;
      return;
    }

    setMessage(data.message ?? "تعذر إنشاء العميل");
    setLoading(false);
  }

  const closeSheet = useCallback(() => {
    setCustomer(null);
    setNotFoundPhone("");
    setNewName("");
    setMessage("");
  }, []);

  useModalDismiss(sheetOpen, closeSheet);

  return (
    <div className="mt-5">
      <form onSubmit={search} className="overflow-hidden rounded-[1.75rem] border border-salon-forest/20 bg-white shadow-sm shadow-salon-ink/5">
        <div className="border-b border-salon-line bg-salon-pearl px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-salon-forest">ابدأ من هنا</p>
              <h2 className="mt-1 text-xl font-black">بحث العميل</h2>
            </div>
            <span className="rounded-full border border-salon-line bg-white px-3 py-1 text-xs font-black text-salon-forest">سريع</span>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <label className="block text-sm font-bold">
            رقم جوال العميل
            <input
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value.replace(/\D/g, "").slice(0, 12));
                setMessage("");
              }}
              inputMode="numeric"
              required
              minLength={9}
              maxLength={12}
              placeholder="05xxxxxxxx"
              className="barber-field mt-2 h-16 bg-salon-pearl text-center text-2xl"
            />
          </label>
          {message && !sheetOpen ? <p className="rounded-2xl border border-salon-line bg-salon-mist px-4 py-3 text-sm font-bold text-salon-charcoal">{message}</p> : null}
          <button disabled={loading} aria-busy={loading} className="barber-primary-button h-14 w-full text-lg">
            {loading ? "جاري البحث..." : "بحث وفتح الإجراء"}
          </button>
        </div>
      </form>

      {sheetOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-salon-ink/35 px-3 pb-3 pt-16 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 cursor-default" onClick={closeSheet} />
          <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[1.75rem] border border-salon-line bg-white shadow-2xl shadow-salon-ink/25">
            <div className="flex items-center justify-between gap-3 border-b border-salon-line bg-salon-pearl px-4 py-3">
              <div className="h-1.5 w-12 rounded-full bg-salon-line" />
              <button type="button" onClick={closeSheet} className="rounded-full border border-salon-line bg-white px-3 py-1 text-sm font-black text-salon-charcoal">
                إغلاق
              </button>
            </div>

            {message ? <p className="mx-4 mt-4 rounded-2xl border border-salon-line bg-salon-mist px-4 py-3 text-sm font-bold text-salon-charcoal">{message}</p> : null}

            {customer ? (
              <div className="p-4">
                <p className="text-xs font-black text-salon-forest">تم العثور على العميل</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-3xl font-black text-salon-ink">{customer.name}</h2>
                    <p className="mt-1 font-semibold text-salon-charcoal/75">{customer.phone}</p>
                  </div>
                  <div className="rounded-2xl border border-salon-gold/40 bg-salon-gold/10 px-4 py-3 text-center">
                    <p className="text-xs font-bold text-salon-charcoal/65">النقاط</p>
                    <p className="text-2xl font-black text-salon-forest">{customer.pointsBalance}</p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <InfoTile label="الزيارات" value={customer.visitsCount.toString()} />
                  <InfoTile label="آخر حلاق" value={customer.lastBarberName ?? "-"} />
                  <InfoTile label="آخر خدمة" value={customer.lastServices.join("، ") || "-"} />
                  <InfoTile label="آخر زيارة" value={customer.lastVisitAt ? new Date(customer.lastVisitAt).toLocaleDateString("ar-SA") : "-"} />
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
                  <p className="text-xs font-black text-salon-forest">عميل جديد</p>
                  <h2 className="mt-1 text-2xl font-black">إضافة العميل والمتابعة</h2>
                  <p className="mt-1 text-sm font-semibold text-salon-charcoal/70">الرقم جاهز، أضف الاسم فقط وسيتم فتح تسجيل الزيارة.</p>
                </div>
                <input value={notFoundPhone} readOnly className="barber-field h-12 bg-salon-mist" />
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  required
                  placeholder="اسم العميل"
                  className="barber-field h-14 text-lg"
                />
                <button disabled={loading} aria-busy={loading} className="barber-gold-button h-14 w-full text-lg">
                  {loading ? "جاري الحفظ..." : "حفظ وفتح تسجيل الزيارة"}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toLocalSaudiMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  const localPhone = digits.startsWith("9665") ? `0${digits.slice(3)}` : digits.startsWith("5") ? `0${digits}` : digits;
  return localPhone.startsWith("05") ? localPhone.slice(0, 10) : `05${localPhone.replace(/^0+/, "")}`.slice(0, 10);
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
      <dt className="text-xs font-bold text-salon-charcoal/65">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black">{value}</dd>
    </div>
  );
}
