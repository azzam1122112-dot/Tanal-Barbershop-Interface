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
      <form onSubmit={search} className="space-y-4 rounded-lg border border-salon-line bg-white p-4 shadow-sm">
        <label className="block text-sm font-bold">
          بحث سريع برقم جوال العميل
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            required
            placeholder="05xxxxxxxx"
            className="mt-2 h-14 w-full rounded-md border border-salon-line px-3 text-xl font-bold outline-none focus:border-salon-gold"
          />
        </label>
        <button disabled={loading} className="h-14 w-full rounded-md bg-salon-ink px-4 text-lg font-bold text-white disabled:opacity-60">
          {loading ? "جاري البحث..." : "بحث"}
        </button>
      </form>

      {message ? <p className="rounded-lg border border-salon-line bg-white px-3 py-3 text-sm font-semibold text-salon-charcoal">{message}</p> : null}

      {customer ? (
        <div className="rounded-lg border border-salon-line bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold">{customer.name}</h2>
          <p className="mt-1 text-salon-charcoal">{customer.phone}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-salon-charcoal">النقاط</dt><dd className="font-bold">{customer.pointsBalance}</dd></div>
            <div><dt className="text-salon-charcoal">الزيارات</dt><dd className="font-bold">{customer.visitsCount}</dd></div>
            <div><dt className="text-salon-charcoal">آخر حلاق</dt><dd className="font-bold">{customer.lastBarberName ?? "-"}</dd></div>
            <div><dt className="text-salon-charcoal">آخر خدمة</dt><dd className="font-bold">{customer.lastServices.join("، ") || "-"}</dd></div>
          </dl>
          <Link href={`/barber/customers/${customer.id}`} className="mt-4 block h-14 rounded-md bg-salon-gold px-4 py-4 text-center text-lg font-bold text-salon-ink">
            عرض العميل
          </Link>
        </div>
      ) : null}

      {notFoundPhone ? (
        <form onSubmit={createCustomer} className="space-y-3 rounded-lg border border-salon-line bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">إضافة عميل جديد</h2>
          <input value={notFoundPhone} readOnly className="h-12 w-full rounded-md border border-salon-line bg-salon-mist px-3 font-bold" />
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
            placeholder="اسم العميل"
            className="h-14 w-full rounded-md border border-salon-line px-3 text-lg outline-none focus:border-salon-gold"
          />
          <button disabled={loading} className="h-14 w-full rounded-md bg-salon-gold px-4 text-lg font-bold text-salon-ink disabled:opacity-60">
            {loading ? "جاري الحفظ..." : "حفظ ومتابعة"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
