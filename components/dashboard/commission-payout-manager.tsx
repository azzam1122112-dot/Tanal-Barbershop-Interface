"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatMoney, formatDateTime } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { FeedbackNote, type FeedbackState } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge, EmptyState, TablePanel } from "@/components/dashboard/ui";
/**
 * صرف العمولات من لوحة الإدارة.
 *
 * الرقم الذي يُصرف منه هو **المتبقي الجاري** (مستحق − مدفوع) لا مستحق الفترة
 * المعروضة أعلاه: زيارة تُلغى أو تُسجَّل متأخرة تجعل إقفال الشهر كذبة، أما
 * الرصيد الجاري فيصحّح نفسه.
 */

export type LedgerRow = {
  barberId: string;
  barberName: string;
  salonName: string;
  isActive: boolean;
  commissionEnabled: boolean;
  accrued: number;
  paid: number;
  outstanding: number;
  lastPaidAt: string | null;
  custodyBalance: number;
  hasOpeningSettlement: boolean;
};

export type PayoutRow = {
  id: string;
  barber: { id: string; name: string };
  salon: { id: string; name: string };
  amount: number;
  method: string;
  methodLabel: string;
  reference: string | null;
  note: string | null;
  outstandingAfter: number;
  paidAt: string;
  paidBy: { id: string; name: string } | null;
  reversedAt: string | null;
  reversedBy: { id: string; name: string } | null;
  reversalReason: string | null;
};

const METHODS = [
  { value: "CASH_FROM_SAFE", label: "نقدًا من خزنة الفرع", hint: "تنقص خزنة الفرع بحركة موثقة." },
  { value: "BANK_TRANSFER", label: "تحويل بنكي", hint: "يلزم رقم الحوالة. لا أثر على دفاتر النقد." },
  { value: "BARBER_CUSTODY_DEDUCTION", label: "خصمًا من عهدة الحلاق", hint: "يبقي الحلاق ما يعادلها مما بيده فتنقص عهدته." },
] as const;

export function CommissionPayoutManager({
  ledger,
  payouts,
  canPay,
  periodFrom,
  periodTo,
}: {
  ledger: LedgerRow[];
  payouts: PayoutRow[];
  canPay: boolean;
  periodFrom: string;
  periodTo: string;
}) {
  const [rows, setRows] = useState(ledger);
  const [history, setHistory] = useState(payouts);
  const [openBarberId, setOpenBarberId] = useState<string | null>(null);
  const [method, setMethod] = useState<string>("CASH_FROM_SAFE");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [formFeedback, setFormFeedback] = useState<FeedbackState>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  const totals = useMemo(
    () => ({
      outstanding: round(rows.reduce((total, row) => total + row.outstanding, 0)),
      paid: round(rows.reduce((total, row) => total + row.paid, 0)),
      due: rows.filter((row) => row.outstanding > 0).length,
    }),
    [rows],
  );

  const openRow = rows.find((row) => row.barberId === openBarberId) ?? null;
  const parsedAmount = Number(amount);
  const remainingAfter = openRow ? round(openRow.outstanding - (Number.isFinite(parsedAmount) ? parsedAmount : 0)) : 0;
  const overPay = openRow ? parsedAmount > openRow.outstanding + 0.009 : false;
  const overCustody =
    openRow && method === "BARBER_CUSTODY_DEDUCTION" ? parsedAmount > openRow.custodyBalance + 0.009 : false;

  function startPayout(row: LedgerRow) {
    setOpenBarberId(row.barberId);
    setAmount(String(row.outstanding > 0 ? row.outstanding : ""));
    setMethod(row.custodyBalance > 0 ? "BARBER_CUSTODY_DEDUCTION" : "CASH_FROM_SAFE");
    setToast(null);
    setFormFeedback(null);
    setIdempotencyKey(createIdempotencyKey());
  }

  async function submitPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openRow) return;
    setPending(true);
    setToast(null);
    setFormFeedback(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await safeFetch("/api/dashboard/commission-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barberId: openRow.barberId,
          amount,
          method,
          periodFrom,
          periodTo,
          reference: form.get("reference") || undefined,
          note: form.get("note") || undefined,
          // يبقى المفتاح نفسه عند إعادة المحاولة بعد انقطاع الرد، فلا يُصرف
          // السند مرتين إذا كان الخادم قد حفظ الطلب الأول فعلًا.
          idempotencyKey: idempotencyKey || createIdempotencyKey(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { payout?: PayoutRow; message?: string };

      if (response.ok && data.payout) {
        const paidAmount = data.payout.amount;
        setRows((current) =>
          current.map((row) =>
            row.barberId === openRow.barberId
              ? {
                  ...row,
                  paid: round(row.paid + paidAmount),
                  outstanding: round(row.outstanding - paidAmount),
                  lastPaidAt: data.payout!.paidAt,
                  custodyBalance:
                    method === "BARBER_CUSTODY_DEDUCTION" ? round(row.custodyBalance - paidAmount) : row.custodyBalance,
                }
              : row,
          ),
        );
        setHistory((current) => [data.payout!, ...current]);
        setOpenBarberId(null);
        setAmount("");
        setToast({ message: `تم صرف ${formatMoney(paidAmount)} لـ ${openRow.barberName}`, tone: "success" });
      } else {
        const message = data.message ?? "تعذر تسجيل الصرف";
        setFormFeedback({ message, tone: "error" });
        setToast({ message, tone: "error" });
      }
    } catch {
      const message = "تعذر إكمال الصرف. لم يتغير الرصيد؛ أعد المحاولة بعد التحقق من الاتصال.";
      setFormFeedback({ message, tone: "error" });
      setToast({ message, tone: "error" });
    } finally {
      setPending(false);
    }
  }

  async function reversePayout(payout: PayoutRow) {
    const reason = window.prompt(
      `سبب عكس صرف ${formatMoney(payout.amount)} لـ ${payout.barber.name}؟ (يعود المبلغ إلى متبقيه وإلى النقد)`,
    );
    if (!reason || reason.trim().length < 3) return;
    if (
      !(await confirm({
        title: "عكس سند الصرف؟",
        description: `سيعود ${formatMoney(payout.amount)} إلى متبقي ${payout.barber.name}، وتُسجَّل حركة عكسية موثقة بدل حذف السجل.`,
        confirmLabel: "تأكيد العكس",
        tone: "danger",
      }))
    ) {
      return;
    }

    setPending(true);
    const response = await safeFetch(`/api/dashboard/commission-payouts/${payout.id}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = (await response.json().catch(() => ({}))) as { payout?: PayoutRow; message?: string };

    if (response.ok && data.payout) {
      setHistory((current) => current.map((row) => (row.id === payout.id ? data.payout! : row)));
      setRows((current) =>
        current.map((row) =>
          row.barberId === payout.barber.id
            ? {
                ...row,
                paid: round(row.paid - payout.amount),
                outstanding: round(row.outstanding + payout.amount),
                custodyBalance:
                  payout.method === "BARBER_CUSTODY_DEDUCTION"
                    ? round(row.custodyBalance + payout.amount)
                    : row.custodyBalance,
              }
            : row,
        ),
      );
      setToast({ message: "تم عكس سند الصرف", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر عكس الصرف", tone: "error" });
    }
    setPending(false);
  }

  return (
    <div className="mt-6 space-y-4">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      {confirmDialog}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="المتبقي لكل الحلاقين" value={formatMoney(totals.outstanding)} tone="due" />
        <SummaryTile label="إجمالي ما صُرف" value={formatMoney(totals.paid)} />
        <SummaryTile label="حلاقون لهم متبقٍّ" value={String(totals.due)} />
      </div>

      <TablePanel>
        <table className="dashboard-table min-w-[880px]">
          <thead>
            <tr>
              <th>الحلاق</th>
              <th>الفرع</th>
              <th>المستحق التراكمي</th>
              <th>المصروف</th>
              <th>المتبقي</th>
              <th>آخر صرف</th>
              {canPay ? <th>إجراء</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.barberId}>
                <td className="px-4 py-3 font-bold">
                  {row.barberName}
                  {row.isActive ? null : <span className="mr-2 text-xs font-semibold text-salon-charcoal/60">(معطل)</span>}
                </td>
                <td className="px-4 py-3">{row.salonName || "-"}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.accrued)}</td>
                <td className="px-4 py-3 tabular-nums text-salon-steel">{formatMoney(row.paid)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`font-black tabular-nums ${
                      row.outstanding > 0 ? "text-salon-forest" : row.outstanding < 0 ? "text-salon-ruby" : "text-salon-charcoal/60"
                    }`}
                  >
                    {formatMoney(row.outstanding)}
                  </span>
                  {row.outstanding < 0 ? (
                    <span className="mr-2 text-xs font-bold text-salon-ruby">مدفوع مقدمًا</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-salon-charcoal/70">
                  {row.lastPaidAt ? formatDateTime(row.lastPaidAt) : "لم يُصرف بعد"}
                </td>
                {canPay ? (
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pending || row.outstanding <= 0}
                      onClick={() => startPayout(row)}
                      className="dashboard-button px-4 py-2 text-xs disabled:opacity-50"
                    >
                      صرف
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="لا يوجد حلاقون في نطاقك" description="أضف حلاقًا أو غيّر الفرع النشط." />
          </div>
        ) : null}
      </TablePanel>

      {openRow ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-salon-ink/40 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={`صرف عمولة ${openRow.barberName}`}>
          <button type="button" aria-label="إغلاق" className="absolute inset-0 cursor-default" disabled={pending} onClick={() => setOpenBarberId(null)} />
          <form
            onSubmit={submitPayout}
            className="dashboard-panel relative z-10 w-full max-w-md overflow-hidden p-5"
          >
            <p className="lux-eyebrow">صرف عمولة</p>
            <h2 className="mt-1 text-xl font-bold text-salon-ink">{openRow.barberName}</h2>
            <p className="mt-1 text-sm font-semibold text-salon-charcoal/70">
              المتبقي له الآن <span className="lux-number text-salon-forest">{formatMoney(openRow.outstanding)}</span>
            </p>

            <label className="mt-4 block text-sm font-bold text-salon-charcoal">
              المبلغ المصروف
              <input
                lang="en"
                dir="ltr"
                type="number"
                min={0.01}
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="dashboard-field mt-2 h-12 text-center text-lg"
              />
            </label>

            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-bold text-salon-charcoal">طريقة الصرف</legend>
              <div className="grid gap-2">
                {METHODS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ${
                      method === option.value ? "border-salon-forest bg-salon-forest/5" : "border-salon-line bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={option.value}
                      checked={method === option.value}
                      onChange={() => setMethod(option.value)}
                      className="mt-1 h-4 w-4 accent-salon-forest"
                    />
                    <span className="min-w-0">
                      <span className="block font-bold text-salon-ink">{option.label}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-salon-charcoal/65">{option.hint}</span>
                      {option.value === "BARBER_CUSTODY_DEDUCTION" ? (
                        <span className="mt-1 block text-xs font-bold text-salon-steel">
                          بيده الآن {formatMoney(openRow.custodyBalance)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {method === "BANK_TRANSFER" ? (
              <label className="mt-4 block text-sm font-bold text-salon-charcoal">
                رقم الحوالة
                <input name="reference" required maxLength={120} className="dashboard-field mt-2 h-12" />
              </label>
            ) : (
              <input type="hidden" name="reference" value="" />
            )}

            <label className="mt-4 block text-sm font-bold text-salon-charcoal">
              ملاحظة (اختياري)
              <input name="note" maxLength={300} className="dashboard-field mt-2 h-12" />
            </label>

            <div className="mt-4 rounded-xl border border-salon-line bg-salon-pearl px-4 py-3 text-sm font-bold">
              المتبقي بعد الصرف:{" "}
              <span className={`lux-number ${remainingAfter < 0 ? "text-salon-ruby" : "text-salon-forest"}`}>
                {formatMoney(remainingAfter)}
              </span>
            </div>

            {overPay ? (
              <p className="mt-2 text-xs font-bold text-salon-ruby">
                المبلغ أكبر من المتبقي للحلاق. عدّل المبلغ أو راجع زياراته أولًا.
              </p>
            ) : null}
            {overCustody ? (
              <p className="mt-2 text-xs font-bold text-salon-ruby">
                لا يكفي ما بيد الحلاق من عهدة ({formatMoney(openRow.custodyBalance)}). اختر طريقة أخرى أو قلّل المبلغ.
              </p>
            ) : null}

            <FeedbackNote feedback={formFeedback} className="mt-3" />

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="submit" disabled={pending || overPay || overCustody} className="dashboard-button py-3 disabled:opacity-50">
                {pending ? "جاري الصرف..." : "تأكيد الصرف"}
              </button>
              <button type="button" disabled={pending} onClick={() => setOpenBarberId(null)} className="dashboard-button-soft py-3">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <section className="dashboard-panel p-5">
        <h2 className="lux-section-title">سجل الصرف</h2>
        <p className="dashboard-muted mt-1 text-sm">لا يُحذف سند صرف؛ الخطأ يُعكس بحركة موثقة تعيد المبلغ إلى المتبقي وإلى النقد.</p>
        {history.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="لم يُصرف شيء بعد" description="سيظهر هنا كل سند صرف بمبلغه وطريقته ومن نفّذه." />
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {history.map((payout) => (
              <li
                key={payout.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  payout.reversedAt ? "border-salon-line bg-salon-mist/60" : "border-salon-line bg-white"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-salon-ink">
                    {payout.barber.name}
                    <span className="mr-2 text-xs font-semibold text-salon-charcoal/65">{payout.methodLabel}</span>
                    {payout.reversedAt ? <Badge tone="danger">معكوس</Badge> : null}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-salon-charcoal/65">
                    {formatDateTime(payout.paidAt)}
                    {payout.paidBy ? ` · نفّذه ${payout.paidBy.name}` : ""}
                    {payout.reference ? ` · حوالة ${payout.reference}` : ""}
                    {payout.reversedAt ? ` · سبب العكس: ${payout.reversalReason ?? "-"}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`lux-number text-lg ${payout.reversedAt ? "text-salon-charcoal/50 line-through" : "text-salon-forest"}`}>
                    {formatMoney(payout.amount)}
                  </span>
                  {canPay && !payout.reversedAt ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void reversePayout(payout)}
                      className="dashboard-button-soft px-3 py-2 text-xs disabled:opacity-50"
                    >
                      عكس
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function SummaryTile({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "due" }) {
  return (
    <div className={`dashboard-panel p-4 ${tone === "due" ? "border-salon-gold/40" : ""}`}>
      <p className="text-xs font-bold text-salon-charcoal/70">{label}</p>
      <p className="lux-number mt-1 text-2xl text-salon-ink">{value}</p>
    </div>
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
