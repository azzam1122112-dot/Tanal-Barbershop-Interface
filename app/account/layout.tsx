import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: "حسابي",
  // صفحات حساب شخصية — لا مكان لها في نتائج البحث.
  robots: { index: false, follow: false },
};

/**
 * هيكل صفحات حساب العميل العالمي.
 *
 * منفصل عن `/my/[token]`: تلك بطاقة مؤسسة واحدة تُفتح برابط سرّي، وهذه هوية
 * الشخص عبر المنصّة تُفتح بجلسة. لا يشتركان في تخطيط ولا في مسار.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-salon-mist">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <Link href="/" className="mb-6 flex items-center gap-3 self-center" aria-label="الصفحة الرئيسية">
          <BrandLogo className="h-11 w-11 rounded-xl ring-1 ring-salon-line" priority />
          <span className="text-sm font-bold tracking-[0.2em] text-salon-charcoal/70" dir="ltr">
            XMANSX
          </span>
        </Link>
        {children}
      </main>
    </div>
  );
}
