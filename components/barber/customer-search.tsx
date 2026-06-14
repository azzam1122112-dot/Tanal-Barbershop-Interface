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
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [notFoundPhone, setNotFoundPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setNotFoundPhone(data.phone ?? phone);
      setMessage("العميل غير موجود، يمكنك إضافته الآن");
    }
    setLoading(false);
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      <form onSubmit={search} className="space-y-4 rounded-[1.5rem] border border-salon-line bg-white p-4 shadow-lg shadow-salon-ink/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">بحث العميل</h2>
            <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">أدخل رقم الجوال ثم تابع مباشرة</p>
          </div>
          <span className="rounded-full bg-salon-ink px-3 py-1 text-xs font-black text-salon-gold">سريع</span>
        </div>
        <label className="block text-sm font-bold">
          رقم جوال العميل
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            required
            placeholder="05xxxxxxxx"
            className="mt-2 h-16 w-full rounded-2xl border border-salon-line bg-salon-pearl px-4 text-xl font-black outline-none transition focus:border-salon-gold focus:ring-4 focus:ring-salon-gold/15"
          />
        </label>
        <button disabled={loading} className="h-14 w-full rounded-2xl bg-salon-ink px-4 text-lg font-black text-white shadow-lg shadow-salon-ink/20 transition active:scale-[0.98] disabled:opacity-60">
          {loading ? "جاري البحث..." : "بحث"}
        </button>
      </form>

      {message ? <p className="rounded-2xl border border-salon-line bg-white px-4 py-3 text-sm font-bold text-salon-charcoal shadow-sm">{message}</p> : null}

      {customer ? (
        <div className="overflow-hidden rounded-[1.5rem] border border-salon-line bg-white shadow-xl shadow-salon-ink/10">
          <div className="bg-[linear-gradient(135deg,#24211d_0%,#1f4a3d_100%)] p-4 text-white">
            <p className="text-xs font-bold text-white/60">تم العثور على العميل</p>
            <h2 className="mt-1 text-2xl font-black">{customer.name}</h2>
            <p className="mt-1 font-semibold text-white/75">{customer.phone}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
            <InfoTile label="النقاط" value={customer.pointsBalance.toString()} />
            <InfoTile label="الزيارات" value={customer.visitsCount.toString()} />
            <InfoTile label="آخر حلاق" value={customer.lastBarberName ?? "-"} />
            <InfoTile label="آخر خدمة" value={customer.lastServices.join("، ") || "-"} />
          </dl>
          <Link href={`/barber/customers/${customer.id}`} className="mx-4 mb-4 block h-14 rounded-2xl bg-salon-gold px-4 py-4 text-center text-lg font-black text-salon-ink shadow-lg shadow-salon-gold/25 transition active:scale-[0.98]">
            عرض العميل
          </Link>
        </div>
      ) : null}

      {notFoundPhone ? (
        <form onSubmit={createCustomer} className="space-y-3 rounded-[1.5rem] border border-salon-line bg-white p-4 shadow-lg shadow-salon-ink/5">
          <div>
            <h2 className="text-lg font-black">إضافة عميل جديد</h2>
            <p className="mt-1 text-xs font-semibold text-salon-charcoal/70">الرقم جاهز، أضف الاسم فقط</p>
          </div>
          <input value={notFoundPhone} readOnly className="h-12 w-full rounded-2xl border border-salon-line bg-salon-mist px-4 font-black" />
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            placeholder="اسم العميل"
            className="h-14 w-full rounded-2xl border border-salon-line px-4 text-lg font-bold outline-none transition focus:border-salon-gold focus:ring-4 focus:ring-salon-gold/15"
          />
          <button disabled={loading} className="h-14 w-full rounded-2xl bg-salon-gold px-4 text-lg font-black text-salon-ink shadow-lg shadow-salon-gold/25 transition active:scale-[0.98] disabled:opacity-60">
            {loading ? "جاري الحفظ..." : "حفظ ومتابعة"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
      <dt className="text-xs font-bold text-salon-charcoal/65">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black">{value}</dd>
    </div>
  );
}
