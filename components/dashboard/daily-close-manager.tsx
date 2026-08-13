"use client";

import { FormEvent, useState } from "react";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { safeFetch } from "@/lib/http/safe-fetch";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InlineEmpty } from "@/components/dashboard/ui";
type SummaryRow = {
  barberId: string;
  barberName: string;
  status: "OPEN" | "CLOSED";
  openSession: CashSessionRow | null;
};

type CashSessionRow = {
  id: string;
  barber: { id: string; name: string };
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openingCashAmount: number;
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
  visitsCount: number;
  grossTotal: number;
  discountTotal: number;
  netTotal: number;
  cashTotal: number;
  expensesTotal: number;
  collectionsTotal: number;
  expectedCash: number;
  cardTotal: number;
  pointsEarnedTotal: number;
  pointsRedeemedTotal: number;
  rewardRedemptionsCount: number;
  campaignRedemptionsCount: number;
  cashReceivedAmount: number | null;
  cashDifference: number | null;
  notes: string | null;
};

type CloseResponse = {
  cashSession?: CashSessionRow;
  message?: string;
};

export function DailyCloseManager({ initialSummary }: { initialSummary: SummaryRow[] }) {
  const [summary, setSummary] = useState(initialSummary);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loadingSessionId, setLoadingSessionId] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  async function closeSession(event: FormEvent<HTMLFormElement>, row: SummaryRow) {
    event.preventDefault();
    if (!row.openSession) return;
    const formElement = event.currentTarget;
    if (
      !(await confirm({
        title: `إغلاق جلسة صندوق ${row.barberName}؟`,
        description: "سيُثبت العد وتُغلق الجلسة فقط. تحصيل الكاش يتم مستقلًا من شاشة عهدة الكاش.",
        confirmLabel: "إغلاق الجلسة",
      }))
    ) {
      return;
    }
    setToast(null);
    setLoadingSessionId(row.openSession.id);
    const form = new FormData(formElement);
    const response = await safeFetch("/api/dashboard/cash-sessions/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cashSessionId: row.openSession.id,
        cashReceivedAmount: form.get("cashReceivedAmount") || undefined,
        notes: form.get("notes") || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as CloseResponse;

    if (response.ok && data.cashSession) {
      setSummary((current) => current.map((item) => (item.barberId === row.barberId ? { ...item, status: "CLOSED", openSession: null } : item)));
      setToast({ message: "تم إغلاق جلسة الصندوق دون تسجيل تحصيل", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إغلاق جلسة الصندوق", tone: "error" });
    }
    setLoadingSessionId("");
  }

  return (
    <div className="mt-6 space-y-4">
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="dashboard-panel table-scroll-wrap overflow-hidden">
        <div className="table-scroll">
        <table className="dashboard-table min-w-[1160px]">
          <thead>
            <tr>
              <th className="px-3 py-3 text-right">الحلاق</th>
              <th className="px-3 py-3 text-right">الحالة</th>
              <th className="px-3 py-3 text-right">بدأت</th>
              <th className="px-3 py-3 text-right">المدة</th>
              <th className="px-3 py-3 text-right">الزيارات</th>
              <th className="px-3 py-3 text-right">الكاش</th>
              <th className="px-3 py-3 text-right">عهدة البداية</th>
              <th className="px-3 py-3 text-right">مصروفات الدرج</th>
              <th className="px-3 py-3 text-right">تحصيلات الإدارة</th>
              <th className="px-3 py-3 text-right">المتوقع</th>
              <th className="px-3 py-3 text-right">الشبكة</th>
              <th className="px-3 py-3 text-right">الصافي</th>
              <th className="px-3 py-3 text-right">الخصومات</th>
              <th className="px-3 py-3 text-right">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-salon-line">
            {summary.map((row) => {
              const session = row.openSession;
              return (
                <tr key={row.barberId}>
                  <td className="px-3 py-3 font-bold">{row.barberName}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-lg px-2 py-1 text-xs font-bold ${session ? "bg-green-50 text-green-700" : "bg-salon-mist text-salon-charcoal"}`}>
                      {session ? "مفتوحة" : "لا توجد جلسة مفتوحة"}
                    </span>
                  </td>
                  <td className="px-3 py-3">{session ? formatDateTime(session.openedAt) : "-"}</td>
                  <td className="px-3 py-3">{session ? formatDuration(session.openedAt) : "-"}</td>
                  <td className="px-3 py-3">{session?.visitsCount ?? 0}</td>
                  <td className="px-3 py-3">{formatMoney(session?.cashTotal ?? 0)}</td>
                  <td className="px-3 py-3">{formatMoney(session?.openingCashAmount ?? 0)}</td>
                  <td className="px-3 py-3 text-salon-ruby">{formatMoney(session?.expensesTotal ?? 0)}</td>
                  <td className="px-3 py-3 text-salon-steel">{formatMoney(session?.collectionsTotal ?? 0)}</td>
                  <td className="px-3 py-3 font-bold text-salon-forest">{formatMoney(session?.expectedCash ?? 0)}</td>
                  <td className="px-3 py-3">{formatMoney(session?.cardTotal ?? 0)}</td>
                  <td className="px-3 py-3 font-bold">{formatMoney(session?.netTotal ?? 0)}</td>
                  <td className="px-3 py-3">{formatMoney(session?.discountTotal ?? 0)}</td>
                  <td className="px-3 py-3">
                    {session ? (
                      <form onSubmit={(event) => closeSession(event, row)} className="grid min-w-[280px] gap-2">
                        <span className="text-xs font-bold text-salon-charcoal/65">الكاش المعدود عند الإغلاق</span>
                        <input lang="en"
                          name="cashReceivedAmount"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={session.expectedCash}
                          className="dashboard-field py-2"
                        />
                        <input
                          name="notes"
                          placeholder="ملاحظات"
                          className="dashboard-field py-2"
                        />
                        <button disabled={loadingSessionId === session.id} className="dashboard-button-gold px-3 py-2">
                          {loadingSessionId === session.id ? "جاري الإغلاق..." : "إغلاق فقط"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-salon-charcoal">يفتح الحلاق الجلسة من تطبيقه.</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {summary.length === 0 ? <tr><td colSpan={13} className="p-4"><InlineEmpty icon="💈" title="لا يوجد حلاقون نشطون" hint="فعّل حلاقًا من صفحة الحلاقين ليظهر هنا صندوقه." /></td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function formatDuration(openedAt: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / (60 * 60 * 1000)));
  if (hours < 1) return "أقل من ساعة";
  return `${formatNumber(hours)} ساعة`;
}
