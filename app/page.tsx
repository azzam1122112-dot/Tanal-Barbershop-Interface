import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";

const features: { icon: IconName; title: string; description: string }[] = [
  { icon: "visits", title: "تسجيل الزيارات", description: "تطبيق حلاق موبايل أولًا يسجّل الزيارة والخدمات والدفع في ثوانٍ." },
  { icon: "cash", title: "جلسات الصندوق", description: "فتح وإغلاق الصندوق وتحصيل الكاش والشبكة مع كشف الفروقات." },
  { icon: "loyalty", title: "برنامج الولاء", description: "نقاط ومكافآت تلقائية، واستبدال فوري عند تسجيل الزيارة." },
  { icon: "campaigns", title: "الحملات التسويقية", description: "عروض موجّهة لشرائح العملاء بنسبة أو مبلغ ثابت ومدة محددة." },
  { icon: "whatsapp", title: "رسائل واتساب يدوية", description: "روابط جاهزة لإرسال يدوي آمن، دون إرسال تلقائي أو جماعي." },
  { icon: "reports", title: "التقارير والتدقيق", description: "إيرادات ومؤشرات يومية، وسجل تدقيق كامل لكل عملية حساسة." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-12 w-12 shadow-lux ring-1 ring-salon-gold/20" priority />
          <div className="leading-tight">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">حلاق تنال</p>
            <p className="text-sm font-bold text-salon-ink">منصة تشغيل الحلاقة الرجالية</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/dashboard/login" className="dashboard-button-soft px-3 py-2 text-xs sm:px-4 sm:text-sm">
            مسار الإدارة
          </Link>
          <Link href="/barber/login" className="dashboard-button-gold px-3 py-2 text-xs sm:px-4 sm:text-sm">
            دخول الحلاقين
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:pt-14">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-salon-gold/30 bg-white/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold shadow-lux">
            <span className="h-1.5 w-1.5 rounded-full bg-salon-gold" aria-hidden="true" />
            منصة SaaS للولاء وتشغيل الصالونات
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-salon-ink md:text-6xl">
            أدِر صالون الحلاقة الرجالية باحترافية فاخرة
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-salon-charcoal">
            نظام متكامل لتسجيل الزيارات، إدارة جلسات الصندوق، برنامج الولاء والمكافآت،
            الحملات التسويقية، ورسائل واتساب اليدوية — بواجهة عربية وتطبيق حلاق سريع.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/barber/login" className="dashboard-button-gold px-6 py-3.5 text-base">
              <Icon name="scissors" className="h-5 w-5" />
              دخول الحلاقين
            </Link>
            <Link href="/dashboard/login" className="dashboard-button px-6 py-3.5 text-base">
              <Icon name="reports" className="h-5 w-5" />
              مسار الإدارة
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium text-salon-charcoal/70">
            صالون يعمل 24 ساعة · لا إرسال واتساب تلقائي · سجل تدقيق كامل
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
          <h2 className="text-xl font-bold tracking-tight text-salon-ink">كل ما يحتاجه الصالون في مكان واحد</h2>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="dashboard-panel lux-hover relative overflow-hidden p-5">
              <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-sheen" aria-hidden="true" />
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-salon-ink text-salon-gold">
                <Icon name={feature.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight text-salon-ink">{feature.title}</h3>
              <p className="mt-2 text-sm leading-7 text-salon-charcoal">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="relative overflow-hidden rounded-3xl bg-sidebar-onyx p-6 text-white shadow-lux-lg sm:p-10">
          <span className="pointer-events-none absolute -top-24 left-[-10%] h-72 w-72 rounded-full bg-salon-gold/10 blur-3xl" aria-hidden="true" />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/60 to-transparent" aria-hidden="true" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">مساران، تجربة واحدة فاخرة</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">اختر مسارك للدخول</h2>
            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              <PathCard
                icon="scissors"
                eyebrow="للحلاقين"
                title="تطبيق الحلاق"
                description="مصمم للجوال أولًا: بحث العميل، تسجيل الزيارة والخدمات، الكاش والشبكة، والمكافآت — بسرعة وبخطوات قليلة."
                href="/barber/login"
                cta="دخول الحلاقين"
                primary
              />
              <PathCard
                icon="reports"
                eyebrow="للإدارة"
                title="لوحة الإدارة"
                description="متابعة الصندوق والتقارير والتصحيحات، إدارة الحلاقين والخدمات والعملاء، الحملات والولاء ورسائل واتساب."
                href="/dashboard/login"
                cta="دخول الإدارة"
              />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-salon-line/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-salon-charcoal sm:flex-row">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-8 w-8 ring-1 ring-salon-gold/20" />
            <span className="font-bold text-salon-ink">حلاق تنال</span>
          </div>
          <p className="text-xs font-medium text-salon-charcoal/70">منصة تشغيل وولاء للحلاقة الرجالية · جميع الحقوق محفوظة</p>
        </div>
      </footer>
    </main>
  );
}

function PathCard({
  icon,
  eyebrow,
  title,
  description,
  href,
  cta,
  primary = false,
}: {
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-salon-goldlight">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">{eyebrow}</p>
          <h3 className="text-lg font-bold">{title}</h3>
        </div>
      </div>
      <p className="mt-3 flex-1 text-sm leading-7 text-white/65">{description}</p>
      <Link
        href={href}
        className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-[transform,filter] duration-200 hover:brightness-110 active:scale-[0.99] ${
          primary ? "bg-gold-sheen text-white shadow-lux" : "border border-white/15 bg-white/10 text-white hover:bg-white/15"
        }`}
      >
        {cta}
        <Icon name="logout" className="h-4 w-4 -scale-x-100" />
      </Link>
    </div>
  );
}
