export default function HomePage() {
  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-8">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-semibold text-salon-gold">حلاق تنال</p>
          <h1 className="text-4xl font-bold leading-tight md:text-6xl">
            واجهة تنال للحلاقة الرجالية
          </h1>
          <p className="mt-5 text-lg leading-8 text-salon-charcoal">
            نظام فاخر لتشغيل الحلاقة الرجالية، إدارة جلسات الصندوق، العملاء،
            الزيارات، الولاء، الحملات، ورسائل واتساب اليدوية.
          </p>
        </div>
        <div className="grid gap-3 text-sm text-salon-charcoal sm:grid-cols-2">
          <div className="rounded-lg border border-salon-line bg-white p-4">
            تطبيق الحلاق مصمم للجوال أولًا لسرعة تسجيل العملاء والزيارات.
          </div>
          <div className="rounded-lg border border-salon-line bg-white p-4">
            لوحة الإدارة مصممة لمتابعة الصندوق، التقارير، التصحيحات، والولاء.
          </div>
        </div>
      </section>
    </main>
  );
}
