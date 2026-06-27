"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  async function submit(event: FormEvent<HTMLFormElement>, action: "cancel" | "payment" | "amount") {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (
      action === "cancel" &&
      !(await confirm({
        title: "إلغاء هذه الزيارة؟",
        description: "سيتم عكس أثرها المالي والنقاطي.",
        confirmLabel: "إلغاء الزيارة",
        tone: "danger",
      }))
    ) {
      return;
    }
    setToast(null);
    setLoading(action);
    const form = new FormData(formElement);
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
      setToast({ message: "تم تنفيذ التصحيح، سيتم تحديث السجل الآن", tone: "success" });
      window.setTimeout(() => window.location.reload(), 650);
      return;
    }

    setToast({ message: data.message ?? "تعذر تنفيذ العملية", tone: "error" });
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
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <form onSubmit={(event) => submit(event, "payment")} className="grid grid-cols-[1fr_1fr] gap-2">
        <select name="paymentMethod" defaultValue={visit.paymentMethod === "CASH" ? "NETWORK" : "CASH"} className="dashboard-field py-2">
          <option value="CASH">كاش</option>
          <option value="NETWORK">شبكة</option>
        </select>
        <input name="reason" required minLength={5} placeholder="سبب تعديل الدفع" className="dashboard-field py-2" />
        <button disabled={loading === "payment"} className="dashboard-button col-span-2 px-3 py-2">
          تعديل الدفع
        </button>
      </form>
      <form onSubmit={(event) => submit(event, "amount")} className="grid grid-cols-[110px_1fr] gap-2">
        <input name="grossAmount" required type="number" min={0.01} step="0.01" defaultValue={visit.grossAmount} className="dashboard-field py-2" />
        <input name="reason" required minLength={5} placeholder="سبب تعديل المبلغ" className="dashboard-field py-2" />
        <button disabled={loading === "amount"} className="dashboard-button-gold col-span-2 px-3 py-2">
          تعديل المبلغ
        </button>
      </form>
      <form onSubmit={(event) => submit(event, "cancel")} className="grid gap-2">
        <input name="reason" required minLength={5} placeholder="سبب الإلغاء" className="dashboard-field border-red-200 py-2 focus:border-red-500 focus:ring-red-100" />
        <button disabled={loading === "cancel"} className="dashboard-danger-button px-3 py-2">
          إلغاء الزيارة
        </button>
      </form>
    </div>
  );
}
