"use client";

import { useState } from "react";
import { formatAmount as formatMoney, formatDateTime, formatNumber } from "@/lib/format";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * لوحة الكاش عند الحلاق.
 *
 * **مبدأ الشاشة:** الرقم الذي يهم الحلاق هو ما في جيبه الآن (رصيد العهدة)، لا
 * ما جمعته الجلسة الجارية. لذلك بطاقة «الكاش الذي لديك» تسبق كل شيء وتبقى
 * ظاهرة بعد إغلاق الجلسة — قبل هذا التغيير كان المبلغ يختفي من شاشته لحظة
 * الإغلاق وهو ما زال في يده.
 */

type CashSession = {
  id: string;
  openedAt: string;
  openingCashAmount: number;
  visitsCount: number;
  cashTotal: number;
  networkTotal: number;
  netTotal: number;
  collectionsTotal: number;
} | null;

type Expense = {
  id: string;
  amount: number;
  categoryLabel: string;
  paymentSource: "CASH_DRAWER" | "EXTERNAL";
  paymentSourceLabel: string;
  note: string;
  payee?: string | null;
};

export type BarberCollection = {
  id: string;
  amount: number;
  remainingAfter: number;
  collectedAt: string;
  collectedByName: string | null;
};

const EXPENSE_CATEGORIES = [
  { value: "SUPPLIES", label: "مستلزمات" },
  { value: "MAINTENANCE", label: "صيانة" },
  { value: "UTILITIES", label: "فواتير وخدمات" },
  { value: "STAFF_ADVANCE", label: "سلفة موظف" },
  { value: "OTHER", label: "أخرى" },
] as const;

export function CashSessionPanel({
  initialSession,
  initialExpenses = [],
  custodyBalance = 0,
  custodyInitialized = false,
  collections = [],
}: {
  initialSession: CashSession;
  initialExpenses?: Expense[];
  /** رصيد العهدة الفعلي: النقد الذي بيد الحلاق الآن عبر الجلسات كلها. */
  custodyBalance?: number;
  /** هل عدّ المدير العهدة عدًّا فعليًا مرة واحدة على الأقل؟ */
  custodyInitialized?: boolean;
  collections?: BarberCollection[];
}) {
  const [cashSession, setCashSession] = useState(initialSession);
  const [loading, setLoading] = useState(false);
  const [openingCashAmount, setOpeningCashAmount] = useState(String(custodyBalance));
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const [removingExpenseId, setRemovingExpenseId] = useState<string | null>(null);
  const [showCollections, setShowCollections] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const expensesTotal = expenses.reduce((total, expense) => total + expense.amount, 0);
  const drawerExpensesTotal = expenses
    .filter((expense) => expense.paymentSource === "CASH_DRAWER")
    .reduce((total, expense) => total + expense.amount, 0);
  // ما يجب أن يكون في الدرج فعليًا بعد ما صُرف منه.
  const expectedCash = Math.round((((cashSession?.openingCashAmount ?? 0) + (cashSession?.cashTotal ?? 0)) - drawerExpensesTotal - (cashSession?.collectionsTotal ?? 0)) * 100) / 100;
  const visibleExpenses = showAllExpenses ? expenses : expenses.slice(0, 4);
  const lastCollection = collections[0] ?? null;

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
        paymentSource: form.get("paymentSource"),
        note: form.get("note"),
        payee: form.get("payee") || undefined,
        reference: form.get("reference") || undefined,
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

  async function removeExpense(expense: Expense) {
    const confirmed = await confirm({
      title: "حذف المصروف؟",
      description: `سيُحذف «${expense.note}» بمبلغ ${formatMoney(expense.amount)}${
        expense.paymentSource === "CASH_DRAWER" ? " ويُعاد المبلغ إلى الكاش المتوقع في درجك." : "."
      }`,
      confirmLabel: "حذف المصروف",
      tone: "danger",
    });
    if (!confirmed) return;

    setRemovingExpenseId(expense.id);
    setMessage("");
    const response = await fetch(`/api/barber/expenses/${expense.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };

    if (response.ok) {
      setExpenses((current) => current.filter((row) => row.id !== expense.id));
      setMessage("تم حذف المصروف");
    } else {
      setMessage(data.message ?? "تعذر حذف المصروف");
    }
    setRemovingExpenseId(null);
  }

  async function openSession() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/barber/cash-session/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingCashAmount }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      cashSession?: {
        id: string;
        openedAt: string;
        openingCashAmount: number;
        visitsCount: number;
        cashTotal: number;
        cardTotal?: number;
        netTotal: number;
        collectionsTotal?: number;
      };
      message?: string;
    };

    if (response.ok && data.cashSession) {
      setCashSession({
        id: data.cashSession.id,
        openedAt: data.cashSession.openedAt,
        openingCashAmount: data.cashSession.openingCashAmount,
        visitsCount: data.cashSession.visitsCount,
        cashTotal: data.cashSession.cashTotal,
        networkTotal: data.cashSession.cardTotal ?? 0,
        netTotal: data.cashSession.netTotal,
        collectionsTotal: data.cashSession.collectionsTotal ?? 0,
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
    // نافذة الإنهاء تذكر المبلغ صراحةً: «لن تستطيع تسجيل زيارة» وحدها لا تخبر
    // الحلاق بكم يخرج من درجه ولا لمن يسلّمه.
    const confirmed = await confirm({
      title: "إنهاء جلسة الصندوق؟",
      description: `في درجك الآن ${formatMoney(expectedCash)} — سلّمها لمدير الفرع ليسجّل التحصيل باسمك. بعد الإنهاء لن تستطيع تسجيل زيارة حتى تفتح جلسة جديدة، ويبقى المبلغ في عهدتك حتى يستلمه المدير.`,
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

  return (
    <div className="space-y-4">
      {confirmDialog}

      {/* بطاقة العهدة: النقد الذي في يده الآن — تبقى مهما كانت حالة الجلسة. */}
      <section className="lux-edge relative overflow-hidden rounded-2xl border border-salon-gold/35 bg-gradient-to-br from-salon-ink via-salon-forest to-salon-ink p-5 text-white shadow-[var(--shadow-lg)]">
        <div aria-hidden="true" className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full bg-salon-gold/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="lux-eyebrow">عهدتك النقدية</p>
              <h2 className="mt-1 text-lg font-bold">الكاش الذي لديك الآن</h2>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold ${
                custodyInitialized
                  ? "border-white/20 bg-white/10 text-white/85"
                  : "border-salon-gold/50 bg-salon-gold/20 text-white"
              }`}
            >
              {custodyInitialized ? "مطابَق مع الإدارة" : "بانتظار العد الأول"}
            </span>
          </div>

          <p className="lux-number mt-4 text-5xl text-white">{formatMoney(custodyBalance)}</p>
          <p className="mt-1.5 text-xs font-semibold leading-5 text-white/70">
            {custodyInitialized
              ? "يزيد مع كل بيع نقدي، وينقص بمصروفات الدرج، ويصفر عندما يستلمه مدير الفرع."
              : "لم يعدّ مدير الفرع عهدتك بعد. اطلب منه تثبيت أول رصيد فعلي حتى يُعتمد هذا الرقم في التحصيل."}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/15 pt-4">
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center">
              <p className="lux-number text-lg text-white">{formatMoney(lastCollection?.amount ?? 0)}</p>
              <p className="text-[11px] font-bold text-white/65">آخر مبلغ سلّمته</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center">
              <p className="text-sm font-bold text-white">
                {lastCollection ? formatDateTime(lastCollection.collectedAt) : "لا يوجد"}
              </p>
              <p className="text-[11px] font-bold text-white/65">تاريخ التسليم</p>
            </div>
          </div>

          {collections.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setShowCollections((current) => !current)}
                aria-expanded={showCollections}
                className="mt-3 w-full rounded-xl border border-white/20 bg-white/5 py-2.5 text-xs font-bold text-white/90 transition active:scale-[0.99]"
              >
                {showCollections ? "إخفاء سجل التسليم" : `سجل تسليماتي (${formatNumber(collections.length)})`}
              </button>
              {showCollections ? (
                <ul className="mt-2 space-y-1.5">
                  {collections.map((collection) => (
                    <li
                      key={collection.id}
                      className="flex items-baseline justify-between gap-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white/85"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{formatDateTime(collection.collectedAt)}</span>
                        <span className="block truncate text-[11px] text-white/60">
                          استلمها {collection.collectedByName ?? "الإدارة"} · بقي لديك {formatMoney(collection.remainingAfter)}
                        </span>
                      </span>
                      <span className="lux-number shrink-0 text-sm text-salon-goldlight">{formatMoney(collection.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-white/20 px-3 py-2.5 text-center text-[11px] font-semibold text-white/60">
              لم يسجَّل لك أي تحصيل بعد. كل تسليم يوثّقه المدير سيظهر هنا باسمه ووقته.
            </p>
          )}
        </div>
      </section>

      {cashSession ? (
        <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[var(--shadow-md)]">
          <div className="flex items-start justify-between gap-3 border-b border-emerald-200 bg-emerald-50 p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-emerald-900">جلسة الصندوق مفتوحة</p>
              <p className="mt-1 truncate text-xs font-semibold text-emerald-800/75">بدأت: {formatDateTime(cashSession.openedAt)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-900">
                <span className="lux-number">{formatNumber(cashSession.visitsCount)}</span> زيارة
              </span>
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

          <div className="p-4">
            {/* الرقم الذي يُسلَّم أولًا وبأكبر خط: باقي البطاقات تفسّره. */}
            <div className="rounded-2xl border border-salon-gold/35 bg-salon-gold/10 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-salon-charcoal/75">المتوقع في الدرج الآن</p>
                  <p className="lux-number mt-0.5 text-3xl text-salon-forest">{formatMoney(expectedCash)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpenseOpen((current) => !current)}
                  aria-expanded={expenseOpen}
                  className="shrink-0 rounded-xl border border-salon-line bg-white px-3 py-2.5 text-xs font-bold text-salon-charcoal transition active:scale-95"
                >
                  {expenseOpen ? "إغلاق" : "تسجيل مصروف"}
                </button>
              </div>
              {expensesTotal > 0 ? (
                <p className="mt-2 border-t border-salon-gold/25 pt-2 text-[11px] font-bold leading-5 text-salon-ruby">
                  خُصم من الدرج {formatMoney(drawerExpensesTotal)}
                  <span className="text-salon-charcoal/60"> · إجمالي المصروفات {formatMoney(expensesTotal)}</span>
                </p>
              ) : null}
            </div>

            {/* أربع بطاقات لا خمس: الخامسة كانت تترك فراغًا بجانبها على الجوال. */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="عهدة البداية" value={formatMoney(cashSession.openingCashAmount)} />
              <MiniStat label="كاش الجلسة" value={formatMoney(cashSession.cashTotal)} tone="gold" />
              <MiniStat label="شبكة الجلسة" value={formatMoney(cashSession.networkTotal)} />
              <MiniStat label="حُصّل للإدارة" value={formatMoney(cashSession.collectionsTotal)} />
            </div>
            <p className="mt-2 text-center text-[11px] font-semibold text-salon-charcoal/60">
              صافي مبيعات الجلسة {formatMoney(cashSession.netTotal)} (كاش + شبكة)
            </p>

            {expenseOpen ? (
              <form onSubmit={addExpense} className="mt-3 grid gap-2 rounded-2xl border border-salon-line bg-salon-pearl p-3">
                <input
                  lang="en"
                  dir="ltr"
                  name="amount"
                  type="number"
                  min={0.5}
                  step="0.5"
                  inputMode="decimal"
                  required
                  placeholder="المبلغ المصروف"
                  className="barber-field h-12"
                />
                <select name="category" defaultValue="SUPPLIES" required className="barber-field h-12">
                  {EXPENSE_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <select name="paymentSource" defaultValue="CASH_DRAWER" required className="barber-field h-12">
                  <option value="CASH_DRAWER">دُفع من درج الكاش</option>
                  <option value="EXTERNAL">دفع خارجي — لا يؤثر في الدرج</option>
                </select>
                <input name="note" required minLength={2} placeholder="السبب (مثال: شراء شامبو)" className="barber-field h-12" />
                <div className="grid grid-cols-2 gap-2">
                  <input name="payee" maxLength={120} placeholder="المورد (اختياري)" className="barber-field h-12" />
                  <input name="reference" maxLength={120} placeholder="مرجع (اختياري)" className="barber-field h-12" />
                </div>
                <button disabled={savingExpense} className="barber-primary-button h-12">
                  {savingExpense ? "جاري الحفظ..." : "حفظ المصروف"}
                </button>
              </form>
            ) : null}

            {expenses.length > 0 ? (
              <div className="mt-3 rounded-2xl border border-salon-line bg-salon-pearl p-3">
                <p className="text-[11px] font-bold text-salon-charcoal/75">
                  مصروفات الجلسة (<span className="lux-number">{formatNumber(expenses.length)}</span>)
                </p>
                <ul className="mt-2 space-y-1.5">
                  {visibleExpenses.map((expense) => (
                    <li key={expense.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                      <span className="min-w-0 text-xs font-semibold">
                        <span className="block truncate">{expense.categoryLabel} · {expense.note}</span>
                        <span className="block truncate text-[11px] text-salon-charcoal/60">{expense.paymentSourceLabel}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="lux-number text-sm text-salon-ruby">{formatMoney(expense.amount)}</span>
                        <button
                          type="button"
                          onClick={() => void removeExpense(expense)}
                          disabled={removingExpenseId === expense.id}
                          aria-label={`حذف مصروف ${expense.note}`}
                          className="grid h-9 w-9 place-items-center rounded-lg border border-salon-line bg-white text-sm font-bold text-salon-ruby transition active:scale-95 disabled:opacity-50"
                        >
                          {removingExpenseId === expense.id ? "…" : "✕"}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
                {expenses.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllExpenses((current) => !current)}
                    aria-expanded={showAllExpenses}
                    className="mt-2 w-full rounded-xl border border-salon-line bg-white py-2.5 text-xs font-bold text-salon-charcoal transition active:scale-[0.99]"
                  >
                    {showAllExpenses ? "عرض أقل" : `عرض الكل (${formatNumber(expenses.length)})`}
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={closeSession}
              disabled={closing}
              className="barber-ghost-button mt-4 h-12 w-full text-sm text-salon-ruby"
            >
              {closing ? "جاري إنهاء الجلسة..." : "إنهاء جلسة الصندوق وتسليم الكاش"}
            </button>
            <p className="mt-2 text-center text-xs font-semibold text-salon-charcoal/65">
              سلّم {formatMoney(expectedCash)} لمدير الفرع بعد الإنهاء.
            </p>
            {message ? (
              <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{message}</p>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-3 border-b border-amber-200/70 px-4 py-4">
            <div>
              <p className="text-sm font-bold text-amber-900">لا توجد جلسة صندوق مفتوحة</p>
              <p className="mt-1 text-sm leading-6 text-amber-800">افتح جلسة صندوق قبل البحث وتسجيل الزيارات.</p>
            </div>
            <span className="h-3 w-3 shrink-0 rounded-full bg-amber-500 shadow-[0_0_0_6px_rgba(245,158,11,0.15)]" />
          </div>
          <div className="p-4">
            {message ? (
              <p role="status" className="mb-3 rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-amber-900">{message}</p>
            ) : null}
            <label className="mb-3 block text-sm font-bold text-amber-950">
              عهدة بداية الدرج
              <span className="mt-1 block text-xs font-semibold leading-5 text-amber-800/75">
                {custodyInitialized
                  ? `يجب أن تطابق عهدتك المسجلة (${formatMoney(custodyBalance)}) — راجع المدير قبل تغييرها.`
                  : "المبلغ الموجود في درجك قبل أول عملية، ولا يُحسب إيرادًا."}
              </span>
              <input
                lang="en"
                dir="ltr"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={openingCashAmount}
                onChange={(event) => setOpeningCashAmount(event.target.value)}
                className="barber-field mt-2 h-12 bg-white"
              />
            </label>
            <button onClick={openSession} disabled={loading} className="barber-primary-button h-14 w-full">
              {loading ? "جاري فتح الجلسة..." : "فتح جلسة صندوق"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "gold" }) {
  return (
    <div
      className={`rounded-xl border p-3 text-center ${
        tone === "gold" ? "border-salon-gold/35 bg-salon-gold/10" : "border-salon-line bg-salon-pearl"
      }`}
    >
      <p className="text-[11px] font-semibold text-salon-charcoal/75">{label}</p>
      <p className="lux-number mt-1 text-base text-salon-ink">{value}</p>
    </div>
  );
}
