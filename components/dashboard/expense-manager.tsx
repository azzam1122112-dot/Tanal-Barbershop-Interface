"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { safeFetch } from "@/lib/http/safe-fetch";

type SalonOption = { id: string; name: string };
type CashSessionOption = {
  id: string;
  salonId: string;
  salonName: string;
  barberName: string;
};

const CATEGORIES = [
  ["SUPPLIES", "مستلزمات"],
  ["MAINTENANCE", "صيانة"],
  ["UTILITIES", "فواتير وخدمات"],
  ["OTHER", "أخرى"],
] as const;

export function ExpenseCreateForm({
  salons,
  openSessions,
  defaultSalonId,
  today,
}: {
  salons: SalonOption[];
  openSessions: CashSessionOption[];
  defaultSalonId: string | null;
  today: string;
}) {
  const router = useRouter();
  const initialSalonId = defaultSalonId ?? salons[0]?.id ?? "";
  const [salonId, setSalonId] = useState(initialSalonId);
  const [paymentSource, setPaymentSource] = useState<"EXTERNAL" | "CASH_DRAWER">("EXTERNAL");
  const [cashSessionId, setCashSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const sessionsForSalon = useMemo(
    () => openSessions.filter((session) => session.salonId === salonId),
    [openSessions, salonId],
  );

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paymentSource === "CASH_DRAWER" && !cashSessionId) {
      setToast({ message: "حدد جلسة الصندوق التي خرج منها المبلغ", tone: "error" });
      return;
    }

    setLoading(true);
    setToast(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await safeFetch("/api/dashboard/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonId,
        cashSessionId: paymentSource === "CASH_DRAWER" ? cashSessionId : null,
        amount: form.get("amount"),
        category: form.get("category"),
        paymentSource,
        note: form.get("note"),
        payee: form.get("payee") || null,
        reference: form.get("reference") || null,
        expenseDate: form.get("expenseDate"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (response.ok) {
      formElement.reset();
      setSalonId(initialSalonId);
      setPaymentSource("EXTERNAL");
      setCashSessionId("");
      setToast({ message: "تم تسجيل المصروف وظهر في التقرير", tone: "success" });
      router.refresh();
    } else {
      setToast({ message: data.message ?? "تعذر تسجيل المصروف", tone: "error" });
    }
    setLoading(false);
  }

  return (
    <>
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <form onSubmit={submitExpense} className="dashboard-panel mt-6 p-5">
        <div>
          <h2 className="lux-section-title">تسجيل مصروف</h2>
          <p className="dashboard-muted mt-1 text-sm">
            الدفع من الدرج يُخصم من الكاش المتوقع، والدفع الخارجي يُخصم من صافي التشغيل فقط.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm font-semibold">
            الفرع
            <select
              name="salonId"
              value={salonId}
              onChange={(event) => {
                setSalonId(event.target.value);
                setCashSessionId("");
              }}
              required
              className="dashboard-field mt-2"
            >
              {salons.map((salon) => <option key={salon.id} value={salon.id}>{salon.name}</option>)}
            </select>
          </label>

          <label className="block text-sm font-semibold">
            تاريخ المصروف
            <input dir="ltr" lang="en" name="expenseDate" type="date" required max={today} defaultValue={today} className="dashboard-field mt-2" />
          </label>

          <label className="block text-sm font-semibold">
            بند المصروف
            <select name="category" defaultValue="SUPPLIES" className="dashboard-field mt-2">
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="block text-sm font-semibold">
            القيمة
            <input lang="en" name="amount" type="number" min={0.01} step={0.01} required className="dashboard-field mt-2" placeholder="0.00" />
          </label>

          <label className="block text-sm font-semibold">
            مصدر الدفع
            <select
              name="paymentSource"
              value={paymentSource}
              onChange={(event) => {
                const next = event.target.value as "EXTERNAL" | "CASH_DRAWER";
                setPaymentSource(next);
                if (next === "EXTERNAL") setCashSessionId("");
              }}
              className="dashboard-field mt-2"
            >
              <option value="EXTERNAL">دفع خارجي / تحويل</option>
              <option value="CASH_DRAWER">من درج الكاش</option>
            </select>
          </label>

          {paymentSource === "CASH_DRAWER" ? (
            <label className="block text-sm font-semibold">
              جلسة الصندوق
              <select
                name="cashSessionId"
                value={cashSessionId}
                onChange={(event) => setCashSessionId(event.target.value)}
                required
                className="dashboard-field mt-2"
              >
                <option value="">اختر الجلسة المفتوحة</option>
                {sessionsForSalon.map((session) => (
                  <option key={session.id} value={session.id}>{session.barberName} · {session.salonName}</option>
                ))}
              </select>
              {sessionsForSalon.length === 0 ? (
                <span className="mt-1 block text-xs font-semibold text-amber-700">لا توجد جلسة صندوق مفتوحة في هذا الفرع.</span>
              ) : null}
            </label>
          ) : null}

          <label className="block text-sm font-semibold xl:col-span-2">
            وصف المصروف
            <input name="note" required minLength={2} maxLength={240} className="dashboard-field mt-2" placeholder="مثال: شراء مناديل ومواد تعقيم" />
          </label>

          <label className="block text-sm font-semibold">
            المستفيد أو الجهة
            <input name="payee" maxLength={120} className="dashboard-field mt-2" placeholder="اختياري" />
          </label>

          <label className="block text-sm font-semibold">
            رقم الفاتورة أو المرجع
            <input name="reference" maxLength={120} dir="ltr" className="dashboard-field mt-2" placeholder="اختياري" />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button disabled={loading || salons.length === 0} className="dashboard-button-gold min-w-40">
            {loading ? "جاري الحفظ..." : "حفظ المصروف"}
          </button>
        </div>
      </form>
    </>
  );
}

export function ExpenseDeleteButton({ expenseId, locked }: { expenseId: string; locked: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  if (locked) return <span className="text-xs font-semibold text-salon-charcoal">مغلق</span>;

  async function removeExpense() {
    if (!(await confirm({
      title: "حذف المصروف؟",
      description: "سيُحذف السجل وتُعاد حسابات المصروفات. لا يمكن حذف مصروف مرتبط بصندوق مغلق.",
      confirmLabel: "حذف المصروف",
      tone: "danger",
    }))) return;

    setLoading(true);
    const response = await safeFetch(`/api/dashboard/expenses/${expenseId}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (response.ok) {
      setToast({ message: "تم حذف المصروف", tone: "success" });
      router.refresh();
    } else {
      setToast({ message: data.message ?? "تعذر حذف المصروف", tone: "error" });
    }
    setLoading(false);
  }

  return (
    <>
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <button type="button" disabled={loading} onClick={() => void removeExpense()} className="text-xs font-bold text-salon-ruby underline decoration-salon-ruby/30 underline-offset-4">
        {loading ? "..." : "حذف"}
      </button>
    </>
  );
}
