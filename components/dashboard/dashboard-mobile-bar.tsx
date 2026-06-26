"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { LogoutButton } from "@/components/logout-button";
import { Icon } from "@/components/icons";
import { SalonSwitcher } from "@/components/dashboard/salon-switcher";
import { useModalDismiss } from "@/components/use-modal-dismiss";

/**
 * شريط علوي + درج تنقّل منزلق للجوال والتابلت (تحت مقاس lg).
 * الشريط الجانبي الثابت يبقى للشاشات الكبيرة فقط.
 */
export function DashboardMobileBar({
  role,
  salons,
  activeSalonId,
}: {
  role: "OWNER" | "ADMIN" | "SUPERVISOR" | null;
  salons: { id: string; name: string }[];
  activeSalonId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);

  useModalDismiss(open, close);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/5 bg-sidebar-onyx px-4 py-3 text-white shadow-lux">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-10 w-10 ring-1 ring-salon-gold/30" priority />
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-eyebrow text-salon-goldlight">واجهة تنال</p>
            <p className="truncate text-sm font-bold">لوحة الإدارة</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          aria-expanded={open}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white transition-colors hover:bg-white/[0.12]"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="إغلاق القائمة" className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm" onClick={close} />
          <aside className="absolute inset-y-0 right-0 flex w-[300px] max-w-[86vw] flex-col bg-sidebar-onyx px-4 py-4 text-white shadow-[var(--shadow-sidebar)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo className="h-11 w-11 ring-1 ring-salon-gold/30" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-eyebrow text-salon-goldlight">واجهة تنال</p>
                  <p className="truncate text-sm font-bold">لوحة الإدارة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="إغلاق"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white transition-colors hover:bg-white/[0.12]"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              <SalonSwitcher salons={salons} activeSalonId={activeSalonId} />
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <DashboardNav role={role} />
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] font-bold uppercase tracking-eyebrow text-white/40">{role === "SUPERVISOR" ? "جلسة مشرف" : "جلسة المدير"}</p>
              <LogoutButton className="mt-3 w-full border-white/15 bg-white/10 text-white hover:bg-white/15" />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
