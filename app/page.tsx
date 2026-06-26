import { BrandLogo } from "@/components/brand-logo";

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8 text-salon-ink">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-10">
        <div className="max-w-2xl">
          <BrandLogo className="mb-6 h-24 w-24 shadow-lux-lg ring-1 ring-salon-gold/20" priority />
          <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">
            <span className="h-px w-8 bg-gradient-to-l from-salon-gold to-transparent" aria-hidden="true" />
            حلاق تنال
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight md:text-6xl">
            واجهة تنال للحلاقة الرجالية
          </h1>
          <p className="mt-5 text-lg leading-8 text-salon-charcoal">
            نظام فاخر لتشغيل الحلاقة الرجالية، إدارة جلسات الصندوق، العملاء،
            الزيارات، الولاء، الحملات، ورسائل واتساب اليدوية.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-salon-charcoal sm:grid-cols-2">
          <div className="dashboard-panel lux-hover relative overflow-hidden p-5">
            <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-sheen" aria-hidden="true" />
            <p className="font-semibold leading-7">تطبيق الحلاق مصمم للجوال أولًا لسرعة تسجيل العملاء والزيارات.</p>
          </div>
          <div className="dashboard-panel lux-hover relative overflow-hidden p-5">
            <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-salon-forest to-salon-ink" aria-hidden="true" />
            <p className="font-semibold leading-7">لوحة الإدارة مصممة لمتابعة الصندوق، التقارير، التصحيحات، والولاء.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
