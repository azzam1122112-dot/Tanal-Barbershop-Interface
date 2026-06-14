"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

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
  const [phone, setPhone] = useState("05");
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [notFoundPhone, setNotFoundPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^05\d{8}$/.test(phone)) {
      setMessage("رقم جوال العميل يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
      return;
    }

    setLoading(true);
    setMessage("");
    setCustomer(null);
    setNotFoundPhone("");

    const response = await fetch(`/api/barber/customers/search?phone=${encodeURIComponent(phone)}`);
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
      setNotFoundPhone(toLocalSaudiMobile(data.phone ?? phone));
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
      window.location.href = `/barber/customers/${data.customer.id}`;
      return;
    }

    setMessage(data.message ?? "تعذر إنشاء العميل");
    setLoading(false);
  }

  return (
    <div className="mt-5 space-y-4">
      <form onSubmit={search} className="barber-card space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">بحث العميل</h2>
            <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">أدخل رقم الجوال ثم تابع مباشرة</p>
          </div>
          <span className="rounded-full border border-salon-line bg-salon-pearl px-3 py-1 text-xs font-black text-salon-forest">سريع</span>
        </div>
        <label className="block text-sm font-bold">
          رقم جوال العميل
          <input
            value={phone}
            onChange={(event) => setPhone(toLocalSaudiMobile(event.target.value))}
            inputMode="numeric"
            required
            minLength={10}
            maxLength={10}
            pattern="05[0-9]{8}"
            placeholder="0555967209"
            className="barber-field mt-2 h-16 bg-salon-pearl text-xl"
          />
          <span className="mt-2 block text-xs font-semibold text-salon-charcoal/65">مثال: 0555967209، وسيتم حفظه تلقائيًا بصيغة واتساب الدولية.</span>
        </label>
        <button disabled={loading} className="barber-primary-button h-14 w-full text-lg">
          {loading ? "جاري البحث..." : "بحث"}
        </button>
      </form>

      {message ? <p className="rounded-2xl border border-salon-line bg-white px-4 py-3 text-sm font-bold text-salon-charcoal shadow-sm">{message}</p> : null}

      {customer ? (
        <div className="overflow-hidden rounded-2xl border border-salon-line bg-white shadow-sm shadow-salon-ink/5">
          <div className="border-b border-salon-line bg-salon-pearl p-4">
            <p className="text-xs font-bold text-salon-forest">تم العثور على العميل</p>
            <h2 className="mt-1 text-2xl font-black text-salon-ink">{customer.name}</h2>
            <p className="mt-1 font-semibold text-salon-charcoal/75">{customer.phone}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
            <InfoTile label="النقاط" value={customer.pointsBalance.toString()} />
            <InfoTile label="الزيارات" value={customer.visitsCount.toString()} />
            <InfoTile label="آخر حلاق" value={customer.lastBarberName ?? "-"} />
            <InfoTile label="آخر خدمة" value={customer.lastServices.join("، ") || "-"} />
          </dl>
          <Link href={`/barber/customers/${customer.id}`} className="barber-gold-button mx-4 mb-4 block h-14 py-4 text-center text-lg">
            عرض العميل
          </Link>
        </div>
      ) : null}

      {notFoundPhone ? (
        <form onSubmit={createCustomer} className="barber-card space-y-3 p-4">
          <div>
            <h2 className="text-lg font-black">إضافة عميل جديد</h2>
            <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">الرقم جاهز، أضف الاسم فقط</p>
          </div>
          <input value={notFoundPhone} readOnly className="barber-field h-12 bg-salon-mist" />
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            placeholder="اسم العميل"
            className="barber-field h-14 text-lg"
          />
          <button disabled={loading} className="barber-gold-button h-14 w-full text-lg">
            {loading ? "جاري الحفظ..." : "حفظ ومتابعة"}
          </button>
        </form>
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
