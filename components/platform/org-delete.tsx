"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

export function OrgDelete({ orgId, name, slug }: { orgId: string; name: string; slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const matches = value.trim().toLowerCase() === slug.toLowerCase();

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/platform/organizations/${orgId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug: value.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (response.ok) {
        router.push("/platform/organizations");
        router.refresh();
      } else {
        setToast({ message: data.message ?? "تعذر حذف المؤسسة", tone: "error" });
        setBusy(false);
      }
    } catch {
      setToast({ message: "تعذر الاتصال بالخادم", tone: "error" });
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-panel mt-6 border-salon-ruby/30 p-5">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-salon-ruby">منطقة الخطر — حذف نهائي</h2>
          <p className="dashboard-muted mt-1">يحذف المؤسسة وكل فروعها وفريقها وعملائها وزياراتها وسجلّاتها نهائيًا. لا يمكن التراجع.</p>
        </div>
        <button type="button" onClick={() => { setValue(""); setOpen(true); }} className="dashboard-danger-button shrink-0 px-4 py-2.5 text-sm">
          حذف المؤسسة نهائيًا
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-salon-ink/55 px-4 py-5 backdrop-blur-sm sm:items-center" onClick={() => !busy && setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            dir="rtl"
            onClick={(event) => event.stopPropagation()}
            className="w-full rounded-2xl border border-salon-line bg-white p-5 text-salon-ink shadow-[0_26px_70px_rgba(16,25,22,0.22)] sm:max-w-md"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-salon-ruby/10 text-xl font-black text-salon-ruby">!</span>
              <div className="min-w-0">
                <h3 className="text-lg font-black leading-tight">حذف «{name}» نهائيًا</h3>
                <p className="mt-2 text-sm font-semibold leading-7 text-salon-charcoal">
                  سيُحذف كل ما يخص هذه المؤسسة بلا رجعة. للتأكيد اكتب معرّف المؤسسة:
                  <span className="mx-1 rounded bg-salon-pearl px-1.5 py-0.5 font-mono font-bold text-salon-ink" dir="ltr">{slug}</span>
                </p>
              </div>
            </div>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              dir="ltr"
              autoFocus
              placeholder={slug}
              disabled={busy}
              className="dashboard-field mt-4"
            />
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="h-12 w-full rounded-xl border border-salon-line bg-white font-black text-salon-charcoal transition active:scale-[0.99] disabled:opacity-50">
                إلغاء
              </button>
              <button type="button" onClick={remove} disabled={!matches || busy} className="h-12 w-full rounded-xl bg-salon-ruby font-black text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? "جاري الحذف..." : "حذف نهائي"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
