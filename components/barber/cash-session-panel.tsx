"use client";

import { useState } from "react";
import { formatAmount as formatMoney, formatDateTime, formatNumber } from "@/lib/format";
import { useConfirm } from "@/components/ui/confirm-dialog";

type CashSession = {
  id: string;
  openedAt: string;
  visitsCount: number;
  cashTotal: number;
  networkTotal: number;
  netTotal: number;
} | null;

type Expense = { id: string; amount: number; categoryLabel: string; note: string };

const EXPENSE_CATEGORIES = [
  { value: "SUPPLIES", label: "مستلزمات" },
  { value: "MAINTENANCE", label: "صيانة" },
  { value: "UTILITIES", label: "فواتير وخدمات" },
  { value: "STAFF_ADVANCE", label: "سلفة موظف" },
  { value: "REFUND", label: "إرجاع مبلغ لعميل" },
  { value: "OTHER", label: "أخرى" },
] as const;

export function CashSessionPanel({
  initialSession,
  initialExpenses = [],
}: {
  initialSession: CashSession;
  initialExpenses?: Expense[];
}) {
  const [cashSession, setCashSession] = useState(initialSession);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const expensesTotal = expenses.reduce((total, expense) => total + expense.amount, 0);
  // ما يجب أن يكون في الدرج فعليًا بعد ما صُرف منه.
  const expectedCash = Math.round(((cashSession?.cashTotal ?? 0) - expensesTotal) * 100) / 100;

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingExpense(true);
    setMessage("");
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    const response = await fetch("/api/barber/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: form.get("amount"),
        category: form.get("category"),
        note: form.get("note"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { expense?: Expense; message?: string };

    if (response.ok && data.expense) {
      setExpenses((current) => [data.expense!, ...current]);
      formEl.reset();
      setExpenseOpen(false);
      setMessage("تم تسجيل المصروف");
    } else {
      setMessage(data.message ?? "تعذر تسجيل المصروف");
    }
    setSavingExpense(false);
  }

  async function openSession() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/barber/cash-session/open", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as {
      cashSession?: {
        id: string;
        openedAt: string;
        visitsCount: number;
        cashTotal: number;
        cardTotal?: number;
        netTotal: number;
      };
      message?: string;
    };

    if (response.ok && data.cashSession) {
      setCashSession({
        id: data.cashSession.id,
        openedAt: data.cashSession.openedAt,
        visitsCount: data.cashSession.visitsCount,
        cashTotal: data.cashSession.cashTotal,
        networkTotal: data.cashSession.cardTotal ?? 0,
        netTotal: data.cashSession.netTotal,
      });
      setMessage("تم فتح جلسة الصندوق");
      window.location.reload();
    } else {
      setMessage(data.message ?? "تعذر فتح جلسة الصندوق");
    }
    setLoading(false);
  }

  async function closeSession() {
    if (!cashSession) return;
    const confirmed = await confirm({
      title: "إنهاء جلسة الصندوق؟",
      description: "بعد الإنهاء لن تستطيع تسجيل زيارة حتى تفتح جلسة جديدة.",
      confirmLabel: "إنهاء الجلسة",
      tone: "danger",
    });
    if (!confirmed) return;
    setClosing(true);
    setMessage("");
    const response = await fetch("/api/barber/cash-session/close", { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (response.ok) {
      setCashSession(null);
      setMessage("تم إنهاء جلسة الصندوق");
      window.location.reload();
    } else {
      setMessage(data.message ?? "تعذر إنهاء جلسة الصندوق");
      setClosing(false);
    }
  }

  if (!cashSession) {
    return (
      <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm shadow-amber-900/5">
        <div className="border-b border-amber-200/70 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-amber-900">لا توجد جلسة صندوق مفتوحة</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">افتح جلسة صندوق قبل البحث وتسجيل الزيارات.</p>
            </div>
            <span className="h-3 w-3 rounded-full bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.15)]" />
          </div>
        </div>
        <div className="p-4">
          {message ? <p className="mb-3 rounded-2xl bg-white/70 px-3 py-2 text-sm font-semibold text-amber-900">{message}</p> : null}
          <button
            onClick={openSession}
            disabled={loading}
            className="barber-primary-button h-14 w-full"
          >
            {loading ? "جاري فتح الجلسة..." : "فتح جلسة صندوق"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm shadow-emerald-950/5">
      <div className="border-b border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-emerald-900">جلسة الصندوق مفتوحة</p>
            <p className="mt-1 text-xs font-semibold text-emerald-800/75">بدأت: {formatDateTime(cashSession.openedAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-black text-emerald-900">{formatNumber(cashSession.visitsCount)} زيارة</span>
            <button
              type="button"
              onClick={closeSession}
              disabled={closing}
              aria-label="إنهاء جلسة الصندوق"
              title="إنهاء جلسة الصندوق"
              className="grid h-10 w-10 place-items-center rounded-full border border-emerald-200 bg-white text-lg font-bold text-salon-ruby transition active:scale-95 disabled:opacity-50"
            >
              {closing ? "…" : "⏻"}
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        <MiniStat label="كاش الجلسة" value={formatMoney(cashSession.cashTotal)} />
        <MiniStat label="شبكة الجلسة" value={formatMoney(cashSession.networkTotal)} />
        <MiniStat label="الصافي" value={formatMoney(cashSession.netTotal)} />
      </div>

      <div className="mx-4 mb-4 rounded-2xl border border-salon-line bg-salon-pearl p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-salon-charcoal/75">المتوقع في الدرج</p>
            <p className="mt-1 text-lg font-black text-salon-forest">{formatMoney(expectedCash)}</p>
            {expensesTotal > 0 ? (
              <p className="mt-1 text-[11px] font-bold text-salon-ruby">
                خُصم {formatMoney(expensesTotal)} مصروفات ({expenses.length})
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setExpenseOpen((current) => !current)}
            className="rounded-xl border border-salon-line bg-white px-3 py-2 text-xs font-bold text-salon-charcoal active:scale-95"
          >
            {expenseOpen ? "إغلاق" : "تسجيل مصروف"}
          </button>
        </div>

        {expenseOpen ? (
          <form onSubmit={addExpense} className="mt-3 grid gap-2">
            <input lang="en"
              name="amount"
              type="number"
              min={0.5}
              step="0.5"
              required
              placeholder="المبلغ المصروف"
              className="barber-field"
            />
            <select name="category" defaultValue="SUPPLIES" required className="barber-field">
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <input name="note" required minLength={2} placeholder="السبب (مثال: شراء شامبو)" className="barber-field" />
            <button disabled={savingExpense} className="barber-primary-button h-12">
              {savingExpense ? "جاري الحفظ..." : "حفظ المصروف"}
            </button>
          </form>
        ) : null}

        {expenses.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {expenses.slice(0, 4).map((expense) => (
              <li key={expense.id} className="flex items-baseline justify-between gap-2 text-xs font-semibold">
                <span className="min-w-0 truncate">
                  {expense.categoryLabel} · {expense.note}
                </span>
                <span className="shrink-0 font-black text-salon-ruby">{formatMoney(expense.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={closeSession}
          disabled={closing}
          className="barber-ghost-button h-12 w-full text-sm text-salon-ruby"
        >
          {closing ? "جاري إنهاء الجلسة..." : "إنهاء جلسة الصندوق"}
        </button>
        <p className="mt-2 text-center text-xs font-semibold text-salon-charcoal/65">استخدمها عند التوقف عن استقبال العملاء أو تسليم الكاش.</p>
      </div>
      {message ? <p className="mx-4 mb-4 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{message}</p> : null}
      {confirmDialog}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3 text-center">
      <p className="text-[11px] font-semibold text-salon-charcoal/75">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}
