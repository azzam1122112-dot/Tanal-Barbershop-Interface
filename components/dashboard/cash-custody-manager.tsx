"use client";

import { FormEvent, useMemo, useState } from "react";
import { Badge, Field, InlineEmpty, Notice, SectionPanel, StatCard, TablePanel } from "@/components/dashboard/ui";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

type Policy = { salonId: string; mode: "DISABLED" | "INTERVAL" | "WEEKDAYS"; intervalDays: number; weekdays: number[]; thresholdAmount: number | null; reminderHour: number };
type BarberRow = {
  id: string; name: string; balance: number; isInitialized: boolean; initializedAt: string | null; lastMovementAt: string | null;
  lastCollectionAt: string | null; openCashSessionId: string | null; openCashSessionAt: string | null;
  dueStatus: "UNINITIALIZED" | "CLEAR" | "DUE" | "OVERDUE" | "DISABLED"; dueAt: string | null; dueReason: string;
};
type SalonRow = { id: string; name: string; safeBalance: number; safeLastMovementAt: string | null; policy: Policy; barbers: BarberRow[]; barberCustodyTotal: number };
type CollectionRow = {
  id: string; salon: { id: string; name: string }; barber: { id: string; name: string }; expectedBefore: number; countedAmount: number;
  discrepancyAmount: number; discrepancyReason: string | null; collectedAmount: number; remainingAfter: number; branchSafeAfter: number;
  note: string | null; collectedBy: { id: string; name: string }; collectedAt: string; reversedAt: string | null;
  reversedBy: { id: string; name: string } | null; reversalReason: string | null;
};
type SafeWithdrawal = { id: string; salonId: string; salonName: string | null; type: string; label: string; amount: number; branchBalanceBefore: number | null; branchBalanceAfter: number | null; note: string | null; occurredAt: string };
type DashboardData = { salons: SalonRow[]; collections: CollectionRow[]; safeWithdrawals: SafeWithdrawal[]; totals: { barberCustody: number; branchSafes: number; uninitializedBarbers: number; dueBarbers: number } };

const DAYS = [
  { value: 0, label: "الأحد" }, { value: 1, label: "الاثنين" }, { value: 2, label: "الثلاثاء" },
  { value: 3, label: "الأربعاء" }, { value: 4, label: "الخميس" }, { value: 5, label: "الجمعة" }, { value: 6, label: "السبت" },
];

export function CashCustodyManager({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{ salon: SalonRow; barber: BarberRow; mode: "initialize" | "collect" } | null>(null);
  const [settingsSalonId, setSettingsSalonId] = useState(initialData.salons[0]?.id ?? "");
  const [reverseId, setReverseId] = useState<string | null>(null);

  async function refresh(message?: string) {
    const response = await fetch("/api/dashboard/cash-custody", { cache: "no-store" });
    const next = (await response.json().catch(() => ({}))) as DashboardData & { message?: string };
    if (!response.ok) throw new Error(next.message ?? "تعذر تحديث دفتر العهدة");
    setData(next);
    if (message) setToast({ message, tone: "success" });
  }

  async function submitJson(url: string, method: "POST" | "PUT", body: Record<string, unknown>, success: string) {
    setBusy(true);
    setToast(null);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "تعذر حفظ العملية");
      await refresh(result.message ?? success);
      setSelected(null);
      setReverseId(null);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "تعذر حفظ العملية", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const activeSettingsSalon = data.salons.find((salon) => salon.id === settingsSalonId) ?? data.salons[0];

  return (
    <div className="mt-6 space-y-6">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="لدى الحلاقين" value={formatMoney(data.totals.barberCustody)} subValue="عهدة جارية وليست دخل اليوم" tone="gold" />
        <StatCard label="في خزائن الفروع" value={formatMoney(data.totals.branchSafes)} subValue="بعد التحصيل وقبل التسليم أو الإيداع" tone="success" />
        <StatCard label="حان تحصيلهم" value={formatNumber(data.totals.dueBarbers)} subValue="حسب الجدول أو حد المبلغ" tone={data.totals.dueBarbers ? "danger" : "neutral"} />
        <StatCard label="تحتاج تهيئة أولى" value={formatNumber(data.totals.uninitializedBarbers)} subValue="عد فعلي واحد يمنع تخمين التاريخ" tone={data.totals.uninitializedBarbers ? "danger" : "neutral"} />
      </div>

      {data.totals.uninitializedBarbers > 0 ? (
        <Notice tone="warning" title="ثبّت الرصيد الفعلي قبل أول تحصيل">
          النظام يتعمد عدم استنتاج الكاش التاريخي. افتح بطاقة الحلاق، عدّ الموجود معه الآن، ثم ثبّته كنقطة انطلاق موثقة.
        </Notice>
      ) : null}

      <SectionPanel title="خريطة العهدة الحالية">
        <div className="grid gap-4 p-5 xl:grid-cols-2">
          {data.salons.map((salon) => (
            <article key={salon.id} className="overflow-hidden rounded-2xl border border-salon-line bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-salon-line bg-gradient-to-l from-salon-pearl to-white px-4 py-4">
                <div><p className="text-xs font-bold text-salon-charcoal/65">{salon.name}</p><h3 className="mt-1 text-xl font-black">خزنة الفرع · {formatMoney(salon.safeBalance)}</h3></div>
                <Badge tone={salon.policy.mode === "DISABLED" ? "neutral" : "info"}>{policyLabel(salon.policy)}</Badge>
              </div>
              <div className="divide-y divide-salon-line/70">
                {salon.barbers.map((barber) => (
                  <div key={barber.id} className="p-4 transition hover:bg-salon-pearl/50">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2"><h4 className="font-black">{barber.name}</h4><DueBadge status={barber.dueStatus} /></div>
                        <p className="mt-1.5 text-xs font-semibold text-salon-charcoal/65">{barber.dueReason}</p>
                      </div>
                      <div className="text-left"><p className="lux-number text-2xl font-black text-salon-ink">{formatMoney(barber.balance)}</p><p className="mt-1 text-[11px] font-bold text-salon-charcoal/55">المتبقي لديه الآن</p></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!barber.isInitialized ? (
                        <button type="button" onClick={() => setSelected({ salon, barber, mode: "initialize" })} className="dashboard-button-gold px-4 py-2.5 text-sm">تثبيت أول رصيد</button>
                      ) : (
                        <button type="button" disabled={barber.balance <= 0} onClick={() => setSelected({ salon, barber, mode: "collect" })} className="dashboard-button px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-45">تحصيل كاش</button>
                      )}
                      {barber.openCashSessionId ? <Badge tone="success">جلسة صندوق مفتوحة</Badge> : <Badge>لا توجد جلسة مفتوحة</Badge>}
                      {barber.lastCollectionAt ? <span className="self-center text-xs font-semibold text-salon-charcoal/60">آخر تحصيل {formatDateTime(barber.lastCollectionAt)}</span> : null}
                    </div>
                  </div>
                ))}
                {salon.barbers.length === 0 ? <div className="p-4"><InlineEmpty title="لا يوجد حلاقون نشطون" /></div> : null}
              </div>
            </article>
          ))}
        </div>
      </SectionPanel>

      {selected ? (
        <CustodyActionPanel
          selection={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onSubmit={(body) => submitJson(
            selected.mode === "initialize" ? "/api/dashboard/cash-custody/initialize" : "/api/dashboard/cash-collections",
            "POST",
            body,
            selected.mode === "initialize" ? "تم تثبيت العهدة" : "تم تسجيل التحصيل",
          )}
        />
      ) : null}

      {activeSettingsSalon ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <PolicyForm key={`${activeSettingsSalon.id}:${activeSettingsSalon.policy.mode}:${activeSettingsSalon.policy.intervalDays}:${activeSettingsSalon.policy.weekdays.join("-")}:${activeSettingsSalon.policy.thresholdAmount}`} salons={data.salons} activeSalon={activeSettingsSalon} onSalonChange={setSettingsSalonId} busy={busy} onSubmit={(body) => submitJson("/api/dashboard/cash-collection-policy", "PUT", body, "تم حفظ جدول التحصيل")} />
          <SafeWithdrawalForm salons={data.salons} defaultSalonId={activeSettingsSalon.id} busy={busy} onSubmit={(body) => submitJson("/api/dashboard/branch-cash-safe/withdrawals", "POST", body, "تم تسجيل حركة خزنة الفرع")} />
        </div>
      ) : null}

      <TablePanel>
        <div className="border-b border-salon-line px-5 py-4"><h2 className="lux-section-title">سجل التحصيلات</h2><p className="dashboard-muted mt-1 text-sm">إيصالات ثابتة؛ التصحيح يتم بعكس موثق يعيد المبلغ للعهدة.</p></div>
        {data.collections.length ? (
          <table className="dashboard-table min-w-[1180px]">
            <thead><tr><th>التاريخ</th><th>الفرع</th><th>الحلاق</th><th>المتوقع قبل العد</th><th>المعدود</th><th>المستلم</th><th>المتبقي</th><th>فرق العد</th><th>المستلم بواسطة</th><th>الحالة</th><th>الإجراء</th></tr></thead>
            <tbody>
              {data.collections.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.collectedAt)}</td><td>{row.salon.name}</td><td className="font-bold">{row.barber.name}</td>
                  <td>{formatMoney(row.expectedBefore)}</td><td>{formatMoney(row.countedAmount)}</td><td className="font-black text-salon-forest">{formatMoney(row.collectedAmount)}</td><td>{formatMoney(row.remainingAfter)}</td>
                  <td className={row.discrepancyAmount ? "text-salon-ruby" : ""}>{formatMoney(row.discrepancyAmount)}{row.discrepancyReason ? <span className="mt-1 block text-xs">{row.discrepancyReason}</span> : null}</td>
                  <td>{row.collectedBy.name}</td><td>{row.reversedAt ? <Badge tone="danger">معكوس</Badge> : <Badge tone="success">مؤكد</Badge>}</td>
                  <td>{!row.reversedAt ? <button type="button" onClick={() => setReverseId(row.id)} className="dashboard-button-soft px-3 py-2 text-xs">عكس التحصيل</button> : <span className="text-xs font-semibold text-salon-charcoal/60">{row.reversalReason}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="p-5"><InlineEmpty title="لا توجد تحصيلات بعد" hint="أول تحصيل مؤكد سيظهر هنا كإيصال دائم." /></div>}
      </TablePanel>

      {reverseId ? <ReversePanel busy={busy} onClose={() => setReverseId(null)} onSubmit={(reason) => submitJson(`/api/dashboard/cash-collections/${reverseId}/reverse`, "POST", { reason }, "تم عكس التحصيل")} /> : null}

      {data.safeWithdrawals.length ? (
        <TablePanel>
          <div className="border-b border-salon-line px-5 py-4"><h2 className="lux-section-title">حركات خروج خزنة الفرع</h2></div>
          <table className="dashboard-table min-w-[760px]"><thead><tr><th>التاريخ</th><th>الفرع</th><th>الحركة</th><th>المبلغ</th><th>الرصيد بعدها</th><th>المرجع</th></tr></thead><tbody>
            {data.safeWithdrawals.map((row) => <tr key={row.id}><td>{formatDateTime(row.occurredAt)}</td><td>{row.salonName}</td><td>{row.label}</td><td className="font-bold">{formatMoney(row.amount)}</td><td>{formatMoney(row.branchBalanceAfter ?? 0)}</td><td>{row.note}</td></tr>)}
          </tbody></table>
        </TablePanel>
      ) : null}
    </div>
  );
}

function CustodyActionPanel({ selection, busy, onClose, onSubmit }: { selection: { salon: SalonRow; barber: BarberRow; mode: "initialize" | "collect" }; busy: boolean; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void }) {
  const [counted, setCounted] = useState(String(selection.barber.balance));
  const [collected, setCollected] = useState(String(selection.barber.balance));
  const countedNumber = Number(counted) || 0;
  const collectedNumber = Number(collected) || 0;
  const difference = Math.round((countedNumber - selection.barber.balance) * 100) / 100;
  const remaining = Math.round((countedNumber - collectedNumber) * 100) / 100;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      salonId: selection.salon.id,
      barberId: selection.barber.id,
      countedAmount: countedNumber,
      ...(selection.mode === "collect" ? { collectedAmount: collectedNumber, discrepancyReason: form.get("discrepancyReason") || null, idempotencyKey: crypto.randomUUID() } : {}),
      note: form.get("note") || null,
    });
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-salon-ink/60 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-[0_30px_100px_rgba(0,0,0,.35)]">
        <div className="bg-gradient-to-l from-salon-ink to-[#24372f] px-6 py-5 text-white"><p className="text-xs font-bold text-salon-gold">{selection.salon.name}</p><h2 className="mt-1 text-2xl font-black">{selection.mode === "initialize" ? "تثبيت أول عهدة" : `تحصيل من ${selection.barber.name}`}</h2><p className="mt-2 text-sm font-semibold text-white/65">{selection.mode === "initialize" ? "أدخل ما تم عده فعليًا الآن، لا مبيعات الأيام السابقة." : `الرصيد المسجل ${formatMoney(selection.barber.balance)}`}</p></div>
        <div className="space-y-4 p-6">
          <Field label="الكاش المعدود فعليًا"><input lang="en" type="number" min="0" step="0.01" required value={counted} onChange={(e) => { setCounted(e.target.value); if (selection.mode === "collect") setCollected(e.target.value); }} className="dashboard-field text-lg font-black" /></Field>
          {selection.mode === "collect" ? <>
            <Field label="المبلغ الذي استلمه المدير"><input lang="en" type="number" min="0.01" max={countedNumber} step="0.01" required value={collected} onChange={(e) => setCollected(e.target.value)} className="dashboard-field text-lg font-black" /></Field>
            <div className="grid grid-cols-2 gap-3"><MiniValue label="فرق العد" value={formatMoney(difference)} danger={difference !== 0} /><MiniValue label="يبقى لدى الحلاق" value={formatMoney(remaining)} danger={remaining < 0} /></div>
            {difference !== 0 ? <Field label="سبب فرق العد"><textarea name="discrepancyReason" required minLength={3} className="dashboard-field min-h-24" placeholder="مثال: مبلغ افتتاحي لم يكن مثبتًا..." /></Field> : null}
          </> : null}
          <Field label="ملاحظة أو مرجع (اختياري)"><input name="note" maxLength={300} className="dashboard-field" placeholder="رقم إيصال ورقي، وصف مختصر..." /></Field>
          <div className="grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="dashboard-button-soft h-12">إلغاء</button><button disabled={busy || remaining < 0} className="dashboard-button-gold h-12 disabled:opacity-50">{busy ? "جاري الحفظ..." : selection.mode === "initialize" ? "تثبيت الرصيد" : "تأكيد التحصيل"}</button></div>
        </div>
      </form>
    </div>
  );
}

function PolicyForm({ salons, activeSalon, onSalonChange, busy, onSubmit }: { salons: SalonRow[]; activeSalon: SalonRow; onSalonChange: (id: string) => void; busy: boolean; onSubmit: (body: Record<string, unknown>) => void }) {
  const [mode, setMode] = useState<Policy["mode"]>(activeSalon.policy.mode);
  const [weekdays, setWeekdays] = useState<number[]>(activeSalon.policy.weekdays);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ salonId: activeSalon.id, mode, intervalDays: form.get("intervalDays"), weekdays, thresholdAmount: form.get("thresholdAmount") || null, reminderHour: form.get("reminderHour") }); }
  return <SectionPanel title="جدول التحصيل الاختياري"><form onSubmit={submit} className="space-y-4 p-5"><p className="dashboard-muted text-sm">تذكير فقط؛ لا يُرحّل أي مبلغ تلقائيًا.</p>
    <Field label="الفرع"><select value={activeSalon.id} onChange={(e) => onSalonChange(e.target.value)} className="dashboard-field">{salons.map((salon) => <option key={salon.id} value={salon.id}>{salon.name}</option>)}</select></Field>
    <Field label="طريقة التذكير"><select value={mode} onChange={(e) => setMode(e.target.value as Policy["mode"])} className="dashboard-field"><option value="DISABLED">بدون جدول دوري</option><option value="INTERVAL">كل عدد محدد من الأيام</option><option value="WEEKDAYS">أيام محددة في الأسبوع</option></select></Field>
    {mode === "INTERVAL" ? <Field label="كل كم يوم؟"><select name="intervalDays" defaultValue={activeSalon.policy.intervalDays} className="dashboard-field"><option value="1">كل يوم</option><option value="2">كل يومين</option><option value="3">كل 3 أيام</option><option value="7">كل أسبوع</option></select></Field> : <input type="hidden" name="intervalDays" value={activeSalon.policy.intervalDays} />}
    {mode === "WEEKDAYS" ? <Field label="أيام التحصيل"><div className="flex flex-wrap gap-2">{DAYS.map((day) => <button key={day.value} type="button" aria-pressed={weekdays.includes(day.value)} onClick={() => setWeekdays((current) => current.includes(day.value) ? current.filter((item) => item !== day.value) : [...current, day.value])} className={`rounded-xl px-3 py-2 text-xs font-bold ring-1 ring-inset ${weekdays.includes(day.value) ? "bg-salon-ink text-white ring-salon-ink" : "bg-white text-salon-charcoal ring-salon-line"}`}>{day.label}</button>)}</div></Field> : null}
    <div className="grid grid-cols-2 gap-3"><Field label="تنبيه عند بلوغ مبلغ"><input lang="en" name="thresholdAmount" type="number" min="1" step="0.01" defaultValue={activeSalon.policy.thresholdAmount ?? ""} placeholder="اختياري" className="dashboard-field" /></Field><Field label="ساعة التذكير"><select name="reminderHour" defaultValue={activeSalon.policy.reminderHour} className="dashboard-field">{[9,12,15,17,19,21].map((hour) => <option key={hour} value={hour}>{hour}:00</option>)}</select></Field></div>
    <button disabled={busy} className="dashboard-button w-full py-3">{busy ? "جاري الحفظ..." : "حفظ سياسة التحصيل"}</button>
  </form></SectionPanel>;
}

function SafeWithdrawalForm({ salons, defaultSalonId, busy, onSubmit }: { salons: SalonRow[]; defaultSalonId: string; busy: boolean; onSubmit: (body: Record<string, unknown>) => void }) {
  const [salonId, setSalonId] = useState(defaultSalonId);
  const safeBalance = useMemo(() => salons.find((salon) => salon.id === salonId)?.safeBalance ?? 0, [salons, salonId]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ salonId, type: form.get("type"), amount: form.get("amount"), note: form.get("note"), idempotencyKey: crypto.randomUUID() }); }
  return <SectionPanel title="خروج من خزنة الفرع"><form onSubmit={submit} className="space-y-4 p-5"><p className="dashboard-muted text-sm">سجّل تسليم المالك أو الإيداع البنكي حتى يبقى رصيد الخزنة حقيقيًا.</p>
    <div className="rounded-2xl bg-salon-ink p-4 text-white"><p className="text-xs font-bold text-white/60">الرصيد المتاح</p><p className="lux-number mt-1 text-3xl font-black text-salon-gold">{formatMoney(safeBalance)}</p></div>
    <Field label="الفرع"><select value={salonId} onChange={(e) => setSalonId(e.target.value)} className="dashboard-field">{salons.map((salon) => <option key={salon.id} value={salon.id}>{salon.name}</option>)}</select></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="الوجهة"><select name="type" className="dashboard-field"><option value="OWNER_PICKUP">تسليم للمالك</option><option value="BANK_DEPOSIT">إيداع بنكي</option></select></Field><Field label="المبلغ"><input lang="en" name="amount" type="number" min="0.01" max={safeBalance} step="0.01" required className="dashboard-field" /></Field></div>
    <Field label="المرجع أو السبب"><input name="note" required minLength={3} maxLength={300} className="dashboard-field" placeholder="رقم الإيداع أو اسم المستلم" /></Field>
    <button disabled={busy || safeBalance <= 0} className="dashboard-button w-full py-3 disabled:opacity-45">{busy ? "جاري الحفظ..." : "تسجيل خروج الكاش"}</button>
  </form></SectionPanel>;
}

function ReversePanel({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(String(new FormData(event.currentTarget).get("reason") ?? "")); }
  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-salon-ink/60 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}><form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-xl font-black">عكس التحصيل</h2><p className="dashboard-muted mt-2 text-sm">سيعود المبلغ إلى عهدة الحلاق ويُخصم من خزنة الفرع، ويبقى الإيصال الأصلي ظاهرًا.</p><Field label="سبب العكس" className="mt-4"><textarea name="reason" required minLength={3} className="dashboard-field min-h-24" autoFocus /></Field><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="dashboard-button-soft h-12">إلغاء</button><button disabled={busy} className="h-12 rounded-xl bg-salon-ruby font-bold text-white disabled:opacity-50">{busy ? "جاري العكس..." : "تأكيد العكس"}</button></div></form></div>;
}

function DueBadge({ status }: { status: BarberRow["dueStatus"] }) {
  if (status === "UNINITIALIZED") return <Badge tone="warning">غير مهيأ</Badge>;
  if (status === "OVERDUE") return <Badge tone="danger">متأخر</Badge>;
  if (status === "DUE") return <Badge tone="warning">حان التحصيل</Badge>;
  if (status === "DISABLED") return <Badge>يدوي</Badge>;
  return <Badge tone="success">منتظم</Badge>;
}
function MiniValue({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className={`rounded-2xl border p-3 ${danger ? "border-red-200 bg-red-50 text-red-800" : "border-salon-line bg-salon-pearl"}`}><p className="text-xs font-bold opacity-65">{label}</p><p className="lux-number mt-1 text-lg font-black">{value}</p></div>; }
function policyLabel(policy: Policy) { if (policy.mode === "INTERVAL") return `كل ${policy.intervalDays} يوم`; if (policy.mode === "WEEKDAYS") return "أيام أسبوعية"; return policy.thresholdAmount ? `عند ${formatMoney(policy.thresholdAmount)}` : "تحصيل يدوي"; }
