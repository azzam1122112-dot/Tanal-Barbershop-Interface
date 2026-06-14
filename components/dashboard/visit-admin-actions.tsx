"use client";

import { FormEvent, useState } from "react";

type VisitRow = {
  id: string;
  status: "COMPLETED" | "CANCELLED";
  grossAmount: number;
  paymentMethod: "CASH" | "NETWORK";
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: { id: string; name: string } | null;
};

type ActionResponse = {
  message?: string;
  visit?: { id: string };
};

export function VisitAdminActions({ visit }: { visit: VisitRow }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>, action: "cancel" | "payment" | "amount") {
    event.preventDefault();
    if (action === "cancel" && !window.confirm("هل تريد إلغاء هذه الزيارة؟ سيتم عكس أثرها المالي والنقاطي.")) {
      return;
    }
    setMessage("");
    setLoading(action);
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "");
    const endpoint =
      action === "cancel"
        ? `/api/dashboard/visits/${visit.id}/cancel`
        : action === "payment"
          ? `/api/dashboard/visits/${visit.id}/payment-method`
          : `/api/dashboard/visits/${visit.id}/amount`;
    const method = action === "cancel" ? "POST" : "PATCH";
    const body =
      action === "payment"
        ? { paymentMethod: form.get("paymentMethod"), reason }
        : action === "amount"
          ? { grossAmount: form.get("grossAmount"), reason }
          : { reason };

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as ActionResponse;

    if (response.ok) {
      setMessage("تم تنفيذ التصحيح");
      window.location.reload();
      return;
    }

    setMessage(data.message ?? "تعذر تنفيذ العملية");
    setLoading("");
  }

  if (visit.status === "CANCELLED") {
    return (
      <div className="min-w-[220px] text-xs text-salon-charcoal">
        <p className="font-bold text-red-700">ملغاة</p>
        <p>{visit.cancelReason ?? "-"}</p>
        <p>{visit.cancelledBy?.name ?? "-"}</p>
        <p>{visit.cancelledAt ? new Date(visit.cancelledAt).toLocaleString("ar-SA") : "-"}</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-[320px] gap-3">
      {message ? <p className="rounded-md bg-salon-mist px-2 py-2 text-xs text-salon-charcoal">{message}</p> : null}
      <form onSubmit={(event) => submit(event, "payment")} className="grid grid-cols-[1fr_1fr] gap-2">
        <select name="paymentMethod" defaultValue={visit.paymentMethod === "CASH" ? "NETWORK" : "CASH"} className="rounded-md border border-salon-line px-2 py-2 outline-none focus:border-salon-gold">
          <option value="CASH">كاش</option>
          <option value="NETWORK">شبكة</option>
        </select>
        <input name="reason" required minLength={5} placeholder="سبب تعديل الدفع" className="rounded-md border border-salon-line px-2 py-2 outline-none focus:border-salon-gold" />
        <button disabled={loading === "payment"} className="col-span-2 rounded-md bg-salon-ink px-3 py-2 font-bold text-white disabled:opacity-60">
          تعديل الدفع
        </button>
      </form>
      <form onSubmit={(event) => submit(event, "amount")} className="grid grid-cols-[110px_1fr] gap-2">
        <input name="grossAmount" required type="number" min={0.01} step="0.01" defaultValue={visit.grossAmount} className="rounded-md border border-salon-line px-2 py-2 outline-none focus:border-salon-gold" />
        <input name="reason" required minLength={5} placeholder="سبب تعديل المبلغ" className="rounded-md border border-salon-line px-2 py-2 outline-none focus:border-salon-gold" />
        <button disabled={loading === "amount"} className="col-span-2 rounded-md bg-salon-gold px-3 py-2 font-bold text-salon-ink disabled:opacity-60">
          تعديل المبلغ
        </button>
      </form>
      <form onSubmit={(event) => submit(event, "cancel")} className="grid gap-2">
        <input name="reason" required minLength={5} placeholder="سبب الإلغاء" className="rounded-md border border-red-200 px-2 py-2 outline-none focus:border-red-500" />
        <button disabled={loading === "cancel"} className="rounded-md bg-red-700 px-3 py-2 font-bold text-white disabled:opacity-60">
          إلغاء الزيارة
        </button>
      </form>
    </div>
  );
}
