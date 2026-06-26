"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export function ErrorView({
  error,
  reset,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    // يُسجَّل في الكونسول/المراقبة دون تسريب التفاصيل للمستخدم.
    console.error(error);
  }, [error]);

  return (
    <main className="barber-shell grid min-h-screen place-items-center px-4 py-10">
      <section className="barber-container">
        <div className="barber-card p-6 text-center">
          <BrandLogo className="mx-auto mb-4 h-20 w-20 shadow-lux ring-1 ring-salon-gold/20" priority />
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-ruby">حدث خطأ غير متوقع</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-salon-ink">تعذّر إكمال العملية</h1>
          <p className="mt-3 text-sm font-medium leading-7 text-salon-charcoal">
            حدث خطأ مؤقت. يمكنك إعادة المحاولة الآن، وإذا تكرر الأمر عُد للشاشة الرئيسية وتابع العمل.
          </p>
          {error.digest ? <p className="mt-2 text-[11px] font-medium text-salon-charcoal/55">رمز الخطأ: {error.digest}</p> : null}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={reset} className="barber-gold-button py-3">
              إعادة المحاولة
            </button>
            <Link href={homeHref} className="barber-ghost-button py-3 text-center">
              {homeLabel}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
