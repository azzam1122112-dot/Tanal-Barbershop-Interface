"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};

/**
 * بديل موحّد عن window.confirm بنافذة داخل التطبيق.
 * الاستخدام: const { confirm, confirmDialog } = useConfirm();
 * ثم: if (!(await confirm({ title, description }))) return;  وارسم {confirmDialog} داخل الواجهة.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirmDialog = options ? (
    <ConfirmDialog options={options} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
  ) : null;

  return { confirm, confirmDialog };
}

function ConfirmDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const danger = options.tone === "danger";
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-salon-ink/55 px-4 py-5 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-2xl border border-salon-line bg-white p-5 text-salon-ink shadow-[0_26px_70px_rgba(16,25,22,0.22)] sm:max-w-sm"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl font-black ${
              danger ? "bg-salon-ruby/10 text-salon-ruby" : "bg-salon-gold/15 text-salon-gold"
            }`}
          >
            {danger ? "!" : "؟"}
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-lg font-black leading-tight">
              {options.title}
            </h2>
            {options.description ? (
              <p className="mt-2 text-sm font-semibold leading-7 text-salon-charcoal">{options.description}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 w-full rounded-xl border border-salon-line bg-white font-black text-salon-charcoal transition active:scale-[0.99]"
          >
            {options.cancelLabel ?? "إلغاء"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`h-12 w-full rounded-xl font-black text-white shadow-sm transition active:scale-[0.99] ${
              danger ? "bg-salon-ruby" : "bg-salon-gold"
            }`}
          >
            {options.confirmLabel ?? "تأكيد"}
          </button>
        </div>
      </section>
    </div>
  );
}
