"use client";

import { FormEvent, useState } from "react";
import { formatMoney } from "@/lib/format";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
  visitsCount: number;
  grossTotal: number;
  discountTotal: number;
  netTotal: number;
  cashTotal: number;
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
        description: "سيتم تأكيد استلام الكاش وإغلاق الجلسة.",
        confirmLabel: "إغلاق واستلام",
      }))
    ) {
      return;
    }
    setToast(null);
    setLoadingSessionId(row.openSession.id);
    const form = new FormData(formElement);
    const response = await fetch("/api/dashboard/cash-sessions/close", {
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
      setToast({ message: "تم إغلاق جلسة الصندوق واستلام الكاش", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إغلاق جلسة الصندوق", tone: "error" });
    }
    setLoadingSessionId("");
  }

  return (
    <div className="mt-6 space-y-4">
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="dashboard-panel overflow-x-auto">
        <table className="dashboard-table min-w-[1160px]">
          <thead>
            <tr>
              <th className="px-3 py-3 text-right">الحلاق</th>
              <th className="px-3 py-3 text-right">الحالة</th>
              <th className="px-3 py-3 text-right">بدأت</th>
              <th className="px-3 py-3 text-right">المدة</th>
              <th className="px-3 py-3 text-right">الزيارات</th>
              <th className="px-3 py-3 text-right">الكاش</th>
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
                  <td className="px-3 py-3">{session ? new Date(session.openedAt).toLocaleString("ar-SA") : "-"}</td>
                  <td className="px-3 py-3">{session ? formatDuration(session.openedAt) : "-"}</td>
                  <td className="px-3 py-3">{session?.visitsCount ?? 0}</td>
                  <td className="px-3 py-3">{formatMoney(session?.cashTotal ?? 0)}</td>
                  <td className="px-3 py-3">{formatMoney(session?.cardTotal ?? 0)}</td>
                  <td className="px-3 py-3 font-bold">{formatMoney(session?.netTotal ?? 0)}</td>
                  <td className="px-3 py-3">{formatMoney(session?.discountTotal ?? 0)}</td>
                  <td className="px-3 py-3">
                    {session ? (
                      <form onSubmit={(event) => closeSession(event, row)} className="grid min-w-[280px] gap-2">
                        <input
                          name="cashReceivedAmount"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={session.cashTotal}
                          className="dashboard-field py-2"
                        />
                        <input
                          name="notes"
                          placeholder="ملاحظات"
                          className="dashboard-field py-2"
                        />
                        <button disabled={loadingSessionId === session.id} className="dashboard-button-gold px-3 py-2">
                          {loadingSessionId === session.id ? "جاري الإغلاق..." : "إغلاق جلسة الصندوق"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-salon-charcoal">يفتح الحلاق الجلسة من تطبيقه.</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {summary.length === 0 ? <tr><td colSpan={10} className="px-4 py-8 text-center text-salon-charcoal">لا يوجد حلاقون نشطون</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDuration(openedAt: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / (60 * 60 * 1000)));
  if (hours < 1) return "أقل من ساعة";
  return `${hours.toLocaleString("ar-SA")} ساعة`;
}
