"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Member = { id: string; name: string; email: string | null; phone: string | null; role: string; isActive: boolean; lastLoginAt: string | null };
type Barber = { id: string; name: string; phone: string; salonName: string | null; isActive: boolean; lastLoginAt: string | null };

const ROLE_LABELS: Record<string, string> = { OWNER: "مالك", ADMIN: "مدير", SUPERVISOR: "مشرف" };

type Issued = { name: string; login: string; secret: string; kind: "password" | "pin" };

function lastLoginText(iso: string | null) {
  return iso ? `آخر دخول ${new Date(iso).toLocaleDateString("ar-SA")}` : "لم يدخل بعد";
}

export function OrgAccessManager({ orgId, members, barbers }: { orgId: string; members: Member[]; barbers: Barber[] }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const [copied, setCopied] = useState(false);

  async function reset(type: "user" | "barber", targetId: string, name: string) {
    const label = type === "user" ? "كلمة مرور" : "رمز دخول";
    const confirmed = await confirm({
      title: `إعادة تعيين ${label} «${name}»؟`,
      description: "ستُلغى بيانات الدخول الحالية فورًا.",
      confirmLabel: "إعادة التعيين",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusyId(targetId);
    try {
      const response = await fetch(`/api/platform/organizations/${orgId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetId }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<Issued> & { message?: string };
      if (response.ok && data.secret) {
        setIssued({ name: data.name ?? name, login: data.login ?? "", secret: data.secret, kind: data.kind ?? "password" });
        setCopied(false);
      } else {
        setToast({ message: data.message ?? "تعذر إعادة التعيين", tone: "error" });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function copySecret() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // المتصفح منع النسخ — يحدد المستخدم الرمز يدويًا.
    }
  }

  return (
    <section className="dashboard-panel mt-6 overflow-hidden">
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="border-b border-salon-line/70 px-5 py-4">
        <h2 className="text-lg font-bold tracking-tight">بيانات الدخول وإعادة التعيين</h2>
        <p className="dashboard-muted mt-1">اعرض حسابات الدخول وأعد تعيين كلمة المرور أو رمز الحلاق عند الحاجة. تُعرض البيانات الجديدة مرة واحدة فقط — انسخها وسلّمها لصاحبها.</p>
      </div>

      {issued ? (
        <div className="mx-5 mt-4 rounded-xl border border-salon-gold/40 bg-amber-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-salon-ink">
                {issued.kind === "password" ? "كلمة مرور مؤقتة" : "رمز دخول مؤقت"} · {issued.name}
              </p>
              {issued.login ? <p className="mt-0.5 text-xs font-medium text-salon-charcoal/70" dir="ltr">{issued.login}</p> : null}
              <p className="mt-2 select-all rounded-lg border border-salon-line bg-white px-3 py-2 font-mono text-lg font-bold tracking-wider text-salon-ink" dir="ltr">{issued.secret}</p>
              <p className="mt-2 text-xs font-medium text-salon-charcoal/70">لن تظهر مرة أخرى. على المستخدم تغييرها بعد أول دخول.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <button type="button" onClick={copySecret} className="dashboard-button-gold px-3 py-2 text-xs">{copied ? "تم النسخ" : "نسخ"}</button>
              <button type="button" onClick={() => setIssued(null)} className="dashboard-button-soft px-3 py-2 text-xs">إغلاق</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-salon-line/70 lg:[direction:ltr]">
        {/* أعضاء الإدارة */}
        <div className="lg:[direction:rtl]">
          <p className="px-5 pt-4 text-xs font-bold uppercase tracking-eyebrow text-salon-charcoal/60">الإدارة ({members.length})</p>
          <div className="mt-1 divide-y divide-salon-line/70">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-bold text-salon-ink">{member.name} <span className="text-xs font-semibold text-salon-gold">{ROLE_LABELS[member.role] ?? member.role}</span></p>
                  <p className="truncate text-xs font-medium text-salon-charcoal/70" dir="ltr">{member.email ?? member.phone}</p>
                  <p className="text-[11px] font-medium text-salon-charcoal/55">{lastLoginText(member.lastLoginAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === member.id}
                  onClick={() => reset("user", member.id, member.name)}
                  className="dashboard-button-soft shrink-0 px-3 py-2 text-xs disabled:opacity-50"
                >
                  {busyId === member.id ? "..." : "إعادة تعيين كلمة المرور"}
                </button>
              </div>
            ))}
            {members.length === 0 ? <p className="px-5 py-5 text-sm text-salon-charcoal">لا يوجد أعضاء إدارة.</p> : null}
          </div>
        </div>

        {/* الحلاقون */}
        <div className="lg:[direction:rtl]">
          <p className="px-5 pt-4 text-xs font-bold uppercase tracking-eyebrow text-salon-charcoal/60">الحلاقون ({barbers.length})</p>
          <div className="mt-1 divide-y divide-salon-line/70">
            {barbers.map((barber) => (
              <div key={barber.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-bold text-salon-ink">
                    {barber.name}
                    {!barber.isActive ? <span className="mr-1.5 text-xs font-semibold text-red-600">معطّل</span> : null}
                  </p>
                  <p className="truncate text-xs font-medium text-salon-charcoal/70" dir="ltr">{barber.phone}{barber.salonName ? ` · ${barber.salonName}` : ""}</p>
                  <p className="text-[11px] font-medium text-salon-charcoal/55">{lastLoginText(barber.lastLoginAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === barber.id}
                  onClick={() => reset("barber", barber.id, barber.name)}
                  className="dashboard-button-soft shrink-0 px-3 py-2 text-xs disabled:opacity-50"
                >
                  {busyId === barber.id ? "..." : "إعادة تعيين الرمز"}
                </button>
              </div>
            ))}
            {barbers.length === 0 ? <p className="px-5 py-5 text-sm text-salon-charcoal">لا يوجد حلاقون.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
