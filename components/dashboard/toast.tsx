"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icons";

export type ToastTone = "success" | "error" | "info" | "warning";

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

  const appearance = {
    success: { card: "border-emerald-300/40 bg-[#071b16] text-emerald-50", icon: "bg-emerald-400/15 text-emerald-300", label: "تم بنجاح" },
    error: { card: "border-rose-300/40 bg-[#211016] text-rose-50", icon: "bg-rose-400/15 text-rose-300", label: "تنبيه مهم" },
    warning: { card: "border-amber-300/40 bg-[#211a0d] text-amber-50", icon: "bg-amber-400/15 text-amber-200", label: "يحتاج انتباه" },
    info: { card: "border-violet-300/40 bg-[#110c1d] text-violet-50", icon: "bg-violet-400/15 text-violet-300", label: "معلومة" },
  }[toast.tone ?? "info"];

  return (
    <div
      role="status"
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      className="fixed left-4 top-4 z-50 w-[calc(100%-2rem)] max-w-md animate-[toast-in_180ms_ease-out]"
    >
      <div className={`relative overflow-hidden rounded-2xl border p-4 shadow-[0_24px_65px_-26px_rgba(15,23,42,.85)] backdrop-blur-xl ${appearance.card}`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${appearance.icon}`}>
            <Icon name={toast.tone === "success" ? "check" : "bell"} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black">{appearance.label}</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-white/75">{toast.message}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق الإشعار" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
