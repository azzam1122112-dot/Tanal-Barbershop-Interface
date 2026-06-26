import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { Reveal } from "@/components/reveal";

const features: { icon: IconName; title: string; description: string }[] = [
  { icon: "visits", title: "تسجيل الزيارات", description: "تطبيق حلاق موبايل أولًا يسجّل الزيارة والخدمات والدفع في ثوانٍ معدودة." },
  { icon: "cash", title: "جلسات الصندوق", description: "فتح وإغلاق الصندوق وتحصيل الكاش والشبكة مع كشف دقيق للفروقات." },
  { icon: "loyalty", title: "برنامج الولاء", description: "نقاط ومكافآت تُحتسب وتُستبدل تلقائيًا، مشتركة بين فروع المؤسسة." },
  { icon: "campaigns", title: "الحملات التسويقية", description: "عروض موجّهة لشرائح العملاء بنسبة أو مبلغ ثابت ومدة محددة." },
  { icon: "whatsapp", title: "واتساب يدوي", description: "روابط جاهزة للإرسال اليدوي الآمن — دون إرسال تلقائي أو جماعي." },
  { icon: "reports", title: "تقارير وتدقيق", description: "مؤشرات مالية يومية وسجل تدقيق كامل لكل عملية حساسة." },
];

const steps: { title: string; description: string }[] = [
  { title: "أنشئ مؤسستك", description: "سجّل صالونك الأول، أضف الحلاقين والخدمات وقواعد الولاء في دقائق." },
  { title: "شغّل يومك", description: "يسجّل الحلاق الزيارات من الجوال، وتُدار جلسات الصندوق والتحصيل بسلاسة." },
  { title: "انمُ بثقة", description: "تابع التقارير، أطلق الحملات، وأضف فروعًا جديدة تحت مظلة مؤسسة واحدة." },
];

const stats: { value: string; label: string }[] = [
  { value: "24/7", label: "تشغيل بلا ورديات" },
  { value: "متعدد", label: "فروع تحت مؤسسة" },
  { value: "كامل", label: "سجل تدقيق" },
  { value: "يدوي", label: "واتساب آمن" },
];

const comparison: { traditional: string; tanal: string }[] = [
  { traditional: "دفاتر وإكسل متفرّقة يصعب تتبّعها", tanal: "لوحة تشغيل لحظية موحّدة لكل فروعك" },
  { traditional: "ورديات ثابتة لا تناسب صالونًا يعمل 24 ساعة", tanal: "جلسة صندوق مرنة تُفتح وتُغلق وقت ما تشاء" },
  { traditional: "لا برنامج ولاء يربط العميل بك", tanal: "نقاط ومكافآت تلقائية مشتركة بين الفروع" },
  { traditional: "رسائل عشوائية أو إزعاج تلقائي للعميل", tanal: "واتساب يدوي مدروس يحترم خصوصية العميل" },
  { traditional: "لا رقابة على التعديلات والتحصيل", tanal: "سجل تدقيق كامل لكل عملية حساسة" },
  { traditional: "فرع واحد يصعب توسعته بأمان", tanal: "مؤسسة متعددة الفروع بعزل تام للبيانات" },
];

const WHATSAPP_NUMBER = "966537720207";
const WHATSAPP_DISPLAY = "0537720207";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "السلام عليكم، أرغب بالاستفسار عن نظام تنال والاشتراك.",
)}`;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-40 border-b border-salon-line/50 bg-[#faf8f2]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-11 w-11 shadow-lux ring-1 ring-salon-gold/25" priority />
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-eyebrow text-salon-gold">حلاق تنال</p>
              <p className="text-sm font-bold text-salon-ink">منصّة الحلاقة الرجالية</p>
            </div>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-bold text-salon-charcoal md:flex">
            <a href="#features" className="transition-colors hover:text-salon-ink">المزايا</a>
            <a href="#how" className="transition-colors hover:text-salon-ink">كيف يعمل</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/login" className="dashboard-button-soft px-3 py-2 text-xs sm:px-4 sm:text-sm">الإدارة</Link>
            <Link href="/barber/login" className="dashboard-button-gold sheen-overlay px-3 py-2 text-xs sm:px-4 sm:text-sm">دخول الحلاقين</Link>
          </div>
        </div>
      </header>

      {/* ===== Hero (royal onyx) ===== */}
      <section className="relative overflow-hidden bg-sidebar-onyx text-white">
        {/* أضواء ذهبية متحركة */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="animate-glow absolute -top-32 right-[-8%] h-[28rem] w-[28rem] rounded-full bg-salon-gold/20 blur-3xl" />
          <div className="animate-glow absolute bottom-[-25%] left-[-10%] h-[26rem] w-[26rem] rounded-full bg-salon-forest/30 blur-3xl" style={{ animationDelay: "2s" }} />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/60 to-transparent" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal as="p" className="inline-flex items-center gap-2 rounded-full border border-salon-gold/30 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">
              <span className="h-1.5 w-1.5 rounded-full bg-salon-gold shadow-[0_0_12px_2px_rgba(169,130,69,0.7)]" />
              منصّة SaaS للولاء وتشغيل الصالونات
            </Reveal>

            <Reveal as="h1" delay={80} className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
              أدِر صالونك الرجالي
              <br />
              <span className="text-gold-sheen">بفخامةٍ ملكية</span>
            </Reveal>

            <Reveal as="p" delay={160} className="mt-6 max-w-xl text-lg leading-8 text-white/70">
              نظام متكامل لتسجيل الزيارات، إدارة الصندوق، الولاء والمكافآت، الحملات،
              ورسائل واتساب — بواجهة عربية أنيقة وتطبيق حلاق سريع، يخدم مؤسستك وكل فروعها.
            </Reveal>

            <Reveal delay={240} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/barber/login" className="dashboard-button-gold sheen-overlay px-7 py-4 text-base">
                <Icon name="scissors" className="h-5 w-5" />
                دخول الحلاقين
              </Link>
              <Link href="/dashboard/login" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-7 py-4 text-base font-bold text-white backdrop-blur transition-[transform,background-color] duration-200 hover:bg-white/[0.12] active:scale-[0.99]">
                <Icon name="reports" className="h-5 w-5" />
                مسار الإدارة
              </Link>
            </Reveal>

            <Reveal as="p" delay={320} className="mt-5 text-sm font-medium text-white/45">
              صالون يعمل 24 ساعة · لا إرسال واتساب تلقائي · عزل تام بين المؤسسات
            </Reveal>
          </div>

          {/* بطاقة معاينة عائمة */}
          <Reveal delay={200} className="relative hidden lg:block">
            <div className="animate-float relative">
              <div className="sheen-overlay rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/70 to-transparent" aria-hidden="true" />
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">ملخص اليوم</p>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]" />
                </div>
                <p className="mt-3 text-4xl font-bold tabular-nums">١٢٤٠ <span className="text-lg font-semibold text-white/50">ريال</span></p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    { label: "الكاش", value: "٨٤٠" },
                    { label: "الشبكة", value: "٤٠٠" },
                    { label: "الزيارات", value: "٣٨" },
                    { label: "عملاء جدد", value: "٦" },
                  ].map((tile) => (
                    <div key={tile.label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-[11px] font-semibold text-white/45">{tile.label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{tile.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-royal-gold p-[1px]">
                  <div className="flex items-center justify-between rounded-2xl bg-sidebar-onyx/80 px-4 py-3">
                    <span className="text-sm font-bold">أفضل حلاق اليوم</span>
                    <span className="text-sm font-bold text-salon-goldlight">عبدالله</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== Stats strip ===== */}
      <section className="border-b border-salon-line/60 bg-[#faf8f2]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-5 sm:grid-cols-4">
          {stats.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 80} className="px-4 py-7 text-center">
              <p className="text-3xl font-bold tracking-tight text-salon-ink">{stat.value}</p>
              <p className="mt-1.5 text-xs font-semibold text-salon-charcoal/70">{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== Features ===== */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">كل ما يحتاجه الصالون</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-salon-ink md:text-4xl">منظومة واحدة متكاملة</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 70}>
              <article className="dashboard-panel lux-hover sheen-overlay group relative h-full overflow-hidden p-6">
                <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-sheen" aria-hidden="true" />
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-salon-ink text-salon-gold transition-colors group-hover:bg-salon-forest">
                  <Icon name={feature.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-salon-ink">{feature.title}</h3>
                <p className="mt-2 text-sm leading-7 text-salon-charcoal">{feature.description}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section id="how" className="border-y border-salon-line/60 bg-gradient-to-b from-[#f6f3ec] to-[#efe9dd]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">البداية في دقائق</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-salon-ink md:text-4xl">كيف يعمل</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal key={step.title} delay={index * 110}>
                <div className="dashboard-panel lux-hover relative h-full p-6">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-gold-sheen text-lg font-bold text-white shadow-lux">
                      {index + 1}
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-l from-salon-gold/40 to-transparent" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold tracking-tight text-salon-ink">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-salon-charcoal">{step.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Why / comparison ===== */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">لماذا تنال</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-salon-ink md:text-4xl">المميزات والفروقات</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-salon-charcoal">
            الفرق بين إدارة عشوائية ونظام تشغيل فاخر مصمّم للسوق السعودي، يضع صالونك في مصافّ الاحتراف.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal>
            <div className="dashboard-panel h-full p-6 sm:p-7">
              <h3 className="text-lg font-bold tracking-tight text-salon-charcoal/80">الطريقة التقليدية</h3>
              <ul className="mt-5 space-y-3.5">
                {comparison.map((row) => (
                  <li key={row.traditional} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-salon-ruby/10 text-salon-ruby">
                      <Icon name="close" className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm leading-7 text-salon-charcoal">{row.traditional}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="sheen-overlay relative h-full overflow-hidden rounded-2xl border border-salon-gold/25 bg-sidebar-onyx p-6 text-white shadow-lux-lg sm:p-7">
              <span className="absolute inset-x-0 top-0 h-1 bg-royal-gold" aria-hidden="true" />
              <span className="animate-glow pointer-events-none absolute -top-20 left-[-10%] h-48 w-48 rounded-full bg-salon-gold/15 blur-3xl" aria-hidden="true" />
              <div className="relative flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold tracking-tight">مع <span className="text-gold-sheen">تنال</span></h3>
                <span className="rounded-full border border-salon-gold/40 bg-white/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-eyebrow text-salon-goldlight">موصى به</span>
              </div>
              <ul className="relative mt-5 space-y-3.5">
                {comparison.map((row) => (
                  <li key={row.tanal} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-salon-gold/15 text-salon-goldlight">
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm leading-7 text-white/85">{row.tanal}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== CTA + WhatsApp ===== */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="relative overflow-hidden rounded-3xl bg-sidebar-onyx px-6 py-14 text-center text-white shadow-lux-lg sm:px-12">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="animate-glow absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-salon-gold/20 blur-3xl" />
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/70 to-transparent" />
          </div>
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">جاهز لترقية صالونك؟</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">ابدأ التشغيل اليوم بواجهة فاخرة وأدوات تدير كل تفاصيل يومك.</p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="sheen-overlay inline-flex items-center justify-center gap-2 rounded-xl bg-[#1faa55] px-8 py-4 text-base font-bold text-white shadow-[0_14px_34px_-14px_rgba(31,170,85,0.8)] transition-[transform,filter] duration-200 hover:brightness-110 active:scale-[0.99]"
              >
                <Icon name="whatsapp" className="h-5 w-5" />
                للاستفسارات والاشتراكات
              </a>
              <Link href="/barber/login" className="dashboard-button-gold sheen-overlay px-8 py-4 text-base">دخول الحلاقين</Link>
            </div>

            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-white/70 transition-colors hover:text-white" dir="ltr">
              <Icon name="whatsapp" className="h-4 w-4 text-[#3ad27e]" />
              {WHATSAPP_DISPLAY}
            </a>
          </div>
        </Reveal>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-salon-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-7 text-sm text-salon-charcoal sm:flex-row">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-8 w-8 ring-1 ring-salon-gold/20" />
            <span className="font-bold text-salon-ink">حلاق تنال</span>
          </div>
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-salon-line bg-white px-4 py-2 text-xs font-bold text-salon-ink shadow-sm transition-colors hover:border-[#1faa55]/50 hover:text-[#1faa55]">
            <Icon name="whatsapp" className="h-4 w-4 text-[#1faa55]" />
            <span dir="ltr">{WHATSAPP_DISPLAY}</span>
            <span className="text-salon-charcoal/60">· للاستفسارات والاشتراكات</span>
          </a>
          <p className="text-xs font-medium text-salon-charcoal/70">جميع الحقوق محفوظة</p>
        </div>
      </footer>

      {/* ===== Floating WhatsApp ===== */}
      <a
        href={WHATSAPP_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصل عبر واتساب للاستفسارات والاشتراكات"
        className="group fixed bottom-5 left-5 z-50 inline-flex items-center gap-2.5 rounded-full bg-[#1faa55] py-3 pl-5 pr-4 font-bold text-white shadow-[0_16px_40px_-12px_rgba(31,170,85,0.7)] transition-[transform,filter] duration-200 hover:brightness-110 active:scale-95"
      >
        <span className="absolute inset-0 -z-10 animate-glow rounded-full bg-[#1faa55]/50 blur-md" aria-hidden="true" />
        <Icon name="whatsapp" className="h-6 w-6" />
        <span className="hidden text-sm sm:inline">للاستفسارات</span>
      </a>
    </main>
  );
}
