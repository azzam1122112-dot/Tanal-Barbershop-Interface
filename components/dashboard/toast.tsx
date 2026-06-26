"use client";

import { useEffect } from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastState = {
  message: string;
  tone?: ToastTone;
};

export function DashboardToast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const toneClass = {
    success: "border-green-200 bg-green-50 text-green-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-salon-gold/30 bg-salon-pearl text-salon-ink",
  }[toast.tone ?? "info"];

  const label = {
    success: "تم بنجاح",
    error: "تنبيه",
    info: "معلومة",
  }[toast.tone ?? "info"];

  return (
    <div
      role="status"
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      className="fixed left-4 top-4 z-50 w-[calc(100%-2rem)] max-w-sm animate-[toast-in_180ms_ease-out]"
    >
      <div className={`rounded-xl border px-4 py-3 shadow-lux-lg backdrop-blur ${toneClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold">{label}</p>
            <p className="mt-1 text-sm font-semibold leading-6">{toast.message}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق الإشعار" className="rounded-md px-2 py-1 text-xs font-bold opacity-70 transition hover:bg-black/5 hover:opacity-100">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
