import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export default function NotFoundPage() {
  return (
    <main className="barber-shell grid min-h-screen place-items-center px-4 py-10">
      <section className="barber-container">
        <div className="barber-card p-6 text-center">
          <BrandLogo className="mx-auto mb-4 h-20 w-20 shadow-md shadow-salon-ink/10" priority />
          <p className="text-sm font-black text-salon-forest">الصفحة غير موجودة</p>
          <h1 className="mt-3 text-3xl font-black text-salon-ink">لم نجد هذه الصفحة</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-salon-charcoal">
            يمكنك العودة لشاشة الحلاق أو لوحة الإدارة ومتابعة العمل.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link href="/barber" className="barber-gold-button py-3 text-center">
              شاشة الحلاق
            </Link>
            <Link href="/dashboard" className="barber-ghost-button py-3 text-center">
              الإدارة
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
