"use client";

import { FormEvent, useCallback, useState } from "react";
import { Icon } from "@/components/icons";
import { useModalDismiss } from "@/components/use-modal-dismiss";

export function PlatformOrganizationCreate() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const close = useCallback(() => { if (!pending) { setOpen(false); setError(""); } }, [pending]);
  useModalDismiss(open, close);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/platform/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: form.get("organizationName"),
        salonName: form.get("salonName"),
        ownerName: form.get("ownerName"),
        city: form.get("city"),
        email: form.get("email"),
        phone: form.get("phone"),
        password: form.get("password"),
        acceptPolicies: form.get("acceptPolicies") === "on",
        acceptDataProcessingAgreement: form.get("acceptDataProcessingAgreement") === "on",
        slug: String(form.get("slug") ?? "").trim() || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { organization?: { id: string }; message?: string };
    if (!response.ok || !data.organization) {
      setError(data.message ?? "تعذر إنشاء المؤسسة");
      setPending(false);
      return;
    }
    window.location.href = `/platform/organizations/${data.organization.id}`;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="dashboard-button-gold px-4 py-2.5 text-xs">
        <span className="text-base leading-none">+</span> إنشاء مؤسسة
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-salon-ink/70 backdrop-blur-sm" onClick={close} />
          <section role="dialog" aria-modal="true" aria-labelledby="create-org-title" className="dashboard-panel relative max-h-full w-full max-w-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-sidebar-onyx px-5 py-4 text-white">
              <div><p className="text-[10px] font-bold uppercase tracking-eyebrow text-salon-goldlight">بدء عميل جديد</p><h2 id="create-org-title" className="mt-1 text-xl font-bold">إنشاء المؤسسة والفرع الأول</h2></div>
              <button type="button" onClick={close} disabled={pending} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.06]"><Icon name="close" className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="اسم المؤسسة"><input name="organizationName" required minLength={2} className="dashboard-field" placeholder="مثال: صالونات الرياض" /></Field>
              <Field label="اسم الفرع الأول"><input name="salonName" required minLength={2} className="dashboard-field" placeholder="الفرع الرئيسي" /></Field>
              <Field label="اسم المالك"><input name="ownerName" required minLength={2} className="dashboard-field" /></Field>
              <Field label="المدينة"><input name="city" required minLength={2} className="dashboard-field" placeholder="مثال: الرياض" /></Field>
              <Field label="رقم جوال المالك"><input name="phone" required inputMode="numeric" pattern="05[0-9]{8}" maxLength={10} className="dashboard-field" placeholder="05xxxxxxxx" /></Field>
              <Field label="بريد المالك"><input name="email" required type="email" dir="ltr" className="dashboard-field" /></Field>
              <Field label="كلمة مرور مؤقتة"><input name="password" required type="password" minLength={8} autoComplete="new-password" className="dashboard-field" /></Field>
              <Field label="المعرّف الاختياري" hint="اتركه فارغًا ليولّده النظام تلقائيًا"><input name="slug" dir="ltr" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" className="dashboard-field" placeholder="riyadh-salons" /></Field>
              <div className="rounded-xl border border-salon-line bg-salon-pearl/70 px-4 py-3 text-xs font-semibold leading-6 text-salon-charcoal">
                ينشئ النظام المؤسسة والفرع وحساب المالك وإعدادات البداية، ويضع الاشتراك على باقة التجربة الافتراضية.
              </div>
              <div className="space-y-2 rounded-xl border border-salon-line bg-white px-4 py-3 text-xs font-semibold leading-6 text-salon-charcoal">
                <label className="flex items-start gap-2"><input name="acceptPolicies" type="checkbox" required className="mt-1" /><span>أثبت أن مالك الحساب اطلع على شروط الاشتراك وسياسة الخصوصية ووافق عليهما.</span></label>
                <label className="flex items-start gap-2"><input name="acceptDataProcessingAgreement" type="checkbox" required className="mt-1" /><span>أثبت أن مالك الحساب وافق على اتفاقية معالجة البيانات.</span></label>
              </div>
              {error ? <p className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p> : null}
              <div className="flex gap-2 sm:col-span-2 sm:justify-end">
                <button type="button" onClick={close} disabled={pending} className="dashboard-button-soft">إلغاء</button>
                <button disabled={pending} aria-busy={pending} className="dashboard-button-gold min-w-36">{pending ? "جاري الإنشاء..." : "إنشاء المؤسسة"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-bold text-salon-ink"><span className="mb-2 block">{label}</span>{children}{hint ? <span className="mt-1 block text-[11px] font-semibold text-salon-charcoal/60">{hint}</span> : null}</label>;
}
