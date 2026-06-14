export default function HomePage() {
  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-8">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-semibold text-salon-gold">
            المرحلة 1
          </p>
          <h1 className="text-4xl font-bold leading-tight md:text-6xl">
            TANAL Loyalty
          </h1>
          <p className="mt-5 text-lg leading-8 text-salon-charcoal">
            تم تجهيز أساس مشروع نظام الولاء: Next.js، TypeScript، Tailwind،
            Prisma، PostgreSQL، وموديلات التشغيل الأساسية.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-salon-charcoal sm:grid-cols-2">
          <div className="rounded-lg border border-salon-line bg-white p-4">
            تطبيق الحلاق سيكون Mobile-first وبصلاحيات منفصلة.
          </div>
          <div className="rounded-lg border border-salon-line bg-white p-4">
            لوحة المدير ستكون Desktop-first مع دعم RTL كامل.
          </div>
        </div>
      </section>
    </main>
  );
}
