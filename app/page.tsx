import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { Reveal } from "@/components/reveal";

const WHATSAPP_NUMBER = "966537720207";
const WHATSAPP_DISPLAY = "0537720207";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "السلام عليكم، أرغب بالاستفسار عن منصة XMANSX لإدارة الصالونات.",
)}`;

const platformFeatures: { icon: IconName; title: string; description: string; tag: string }[] = [
  { icon: "visits", title: "الزيارات والمبيعات", description: "تسجيل سريع للخدمة والمبلغ والخصم وطريقة الدفع، مع سجل دقيق لكل تعديل.", tag: "تشغيل يومي" },
  { icon: "cash", title: "الصندوق والفوترة", description: "جلسات صندوق مرنة، تسويات واضحة، وفواتير ضريبية جاهزة مع فصل الكاش عن الشبكة.", tag: "رقابة مالية" },
  { icon: "customers", title: "العملاء والحجوزات", description: "ملف موحّد لكل عميل وبوابة ذاتية للحجز والمتابعة والإلغاء من الجوال.", tag: "تجربة عميل" },
  { icon: "loyalty", title: "الولاء والمكافآت", description: "نقاط وقواعد مكافآت واستبدال منضبط يعمل بين فروع المؤسسة ويشجّع تكرار الزيارة.", tag: "نمو مستدام" },
  { icon: "barbers", title: "الفريق والعمولات", description: "حضور الموظفين، أداء الحلاقين، توزيع الصلاحيات، وحساب العمولات بصورة أوضح.", tag: "إدارة الفريق" },
  { icon: "campaigns", title: "التسويق وواتساب", description: "شرائح ذكية للعملاء ورسائل وعروض موجهة تُرسل يدويًا باحترام وبدون إزعاج تلقائي.", tag: "علاقة أقوى" },
  { icon: "services", title: "الخدمات والمخزون", description: "أسعار الخدمات والمنتجات والمصروفات وتنبيهات المخزون في مساحة تشغيل واحدة.", tag: "سيطرة كاملة" },
  { icon: "reports", title: "التقارير والفروع", description: "مؤشرات لحظية ومقارنات بين الفروع تساعدك على اكتشاف الفرص واتخاذ القرار بثقة.", tag: "رؤية موحّدة" },
];

const journey: { number: string; icon: IconName; title: string; description: string }[] = [
  { number: "01", icon: "settings", title: "جهّز مؤسستك", description: "أضف الفروع والخدمات والفريق والأسعار وقواعد الولاء، واضبط صلاحيات كل مستخدم." },
  { number: "02", icon: "visits", title: "شغّل يومك بسلاسة", description: "يبدأ الموظف حضوره، يستقبل الحجوزات، يسجّل الخدمات والمدفوعات، ويحدّث المخزون." },
  { number: "03", icon: "reports", title: "اقرأ الصورة كاملة", description: "تابع الإيراد والصندوق والعمولات والعملاء من تقارير تجمع التفاصيل دون تشتيت." },
  { number: "04", icon: "campaigns", title: "حوّل البيانات إلى نمو", description: "أعد تنشيط العملاء، كافئ الأكثر ولاءً، ووسّع فروعك على أساس أرقام حقيقية." },
];

const comparison = [
  ["ملفات ودفاتر متفرقة", "بيانات موحّدة ومحدّثة لحظيًا"],
  ["متابعة يدوية للصندوق", "جلسات صندوق وفروقات موثّقة"],
  ["تواصل عشوائي مع العملاء", "شرائح وحملات ورسائل مدروسة"],
  ["صعوبة قياس أداء الفروع", "مقارنة مباشرة من لوحة واحدة"],
  ["صلاحيات غير واضحة", "أدوار وسجل تدقيق لكل عملية حساسة"],
];

const audiences: { icon: IconName; label: string; title: string; description: string }[] = [
  { icon: "staff", label: "للمالك", title: "مؤسستك أمامك", description: "صورة مالية وتشغيلية واضحة لكل فرع، مع تحكم مركزي في الباقات والصلاحيات." },
  { icon: "reports", label: "للمدير", title: "قرار أسرع كل يوم", description: "تقارير وتنبيهات وأدوات متابعة تجعل الإدارة استباقية بدل معالجة الأخطاء بعد وقوعها." },
  { icon: "scissors", label: "للحلاق", title: "واجهة تنجز ولا تعقّد", description: "تجربة جوال مختصرة لتسجيل الزيارة والحضور والعميل دون إبعاده عن كرسيه." },
  { icon: "customers", label: "للعميل", title: "رحلة أهدأ وأقرب", description: "حجز ذاتي، نقاط ومكافآت، وسجل علاقة مستمر مع الصالون عبر الفروع." },
];

const faqs = [
  { question: "ما هي منصة XMANSX؟", answer: "منصة عربية متكاملة لتشغيل وإدارة صالونات الحلاقة الرجالية؛ تجمع المبيعات والصندوق والحجوزات والعملاء والولاء والفريق والمخزون والتقارير في نظام واحد." },
  { question: "هل تناسب أكثر من فرع؟", answer: "نعم. يمكنك إدارة عدة فروع تحت مؤسسة واحدة، مقارنة نتائجها، وتوحيد تجربة العميل وبرنامج الولاء مع عزل بيانات كل مؤسسة." },
  { question: "هل يحتاج الفريق إلى أجهزة خاصة؟", answer: "لا. واجهة الحلاق مصممة للجوال وتعمل من المتصفح، بينما يحصل المدير والمالك على لوحة إدارة أوسع تناسب مهامهما." },
  { question: "كيف يعمل واتساب داخل المنصة؟", answer: "تُنشئ المنصة الرسالة والرابط المناسبين للشريحة المختارة، ثم يرسلها المستخدم يدويًا. لا يوجد إرسال جماعي تلقائي يزعج العميل أو يعرّض الرقم للحظر." },
  { question: "هل تدعم المنصة التشغيل على مدار الساعة؟", answer: "نعم. يعتمد الصندوق على جلسات تُفتح وتُغلق حسب وقت التشغيل الفعلي، ولذلك يناسب الفروع ذات الورديات الممتدة والعمل المتواصل." },
  { question: "كيف أبدأ؟", answer: "أنشئ مؤسستك من زر البدء، أو تواصل معنا عبر واتساب لمساعدتك في اختيار الإعداد والباقات الأنسب لحجم عملك." },
];

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="x-eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-[#12101a] sm:text-4xl lg:text-5xl">{title}</h2>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">{description}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="x-site min-h-screen overflow-x-hidden bg-[#f8f7fb] text-[#12101a]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#09070f]/95 text-white shadow-[0_10px_40px_rgba(9,7,15,.16)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="العودة إلى الصفحة الرئيسية">
            <BrandLogo className="h-11 w-11 rounded-xl border border-violet-400/20 shadow-[0_0_22px_rgba(139,92,246,.2)]" priority />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-base font-bold tracking-[0.12em] text-white" dir="ltr">XMANSX</p>
              <p className="hidden text-[9px] font-semibold uppercase tracking-[0.28em] text-violet-300 sm:block" dir="ltr">INSTITUTION</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-white/70 lg:flex">
            <a className="transition-colors hover:text-white" href="#solution">الحل</a>
            <a className="transition-colors hover:text-white" href="#features">الإمكانات</a>
            <a className="transition-colors hover:text-white" href="#journey">رحلة التشغيل</a>
            <a className="transition-colors hover:text-white" href="#faq">الأسئلة الشائعة</a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link href="/dashboard/login" className="x-button-ghost min-h-10 px-3 text-xs sm:px-5 sm:text-sm">تسجيل الدخول</Link>
            <Link href="/signup" className="x-button-primary min-h-10 px-3 text-xs sm:px-5 sm:text-sm">ابدأ الآن</Link>
          </div>
        </div>
      </header>

      <section className="x-hero relative isolate overflow-hidden text-white">
        <div className="x-grid absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-40 -top-48 h-[38rem] w-[38rem] rounded-full bg-violet-600/25 blur-[120px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-64 -left-24 h-[36rem] w-[36rem] rounded-full bg-fuchsia-600/15 blur-[130px]" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-28">
          <div>
            <Reveal as="p" className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/[.08] px-4 py-2 text-xs font-bold text-violet-200">
              <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_14px_3px_rgba(167,139,250,.7)]" />
              حلول تقنية تصنع الفرق
            </Reveal>

            <Reveal as="h1" delay={70} className="mt-7 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl lg:text-[4rem]">
              إدارة أذكى لصالونك.
              <br />
              <span className="x-gradient-text">ونموّ تراه في كل رقم.</span>
            </Reveal>

            <Reveal as="p" delay={140} className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg sm:leading-9">
              منصة <strong className="font-bold text-white" dir="ltr">XMANSX</strong> تجمع كل تفاصيل صالونك — من الحجز والزيارة إلى الصندوق والولاء والتقارير — في تجربة عربية واحدة تمنح فريقك سرعة، وتمنحك رؤية كاملة.
            </Reveal>

            <Reveal delay={210} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="x-button-primary min-h-14 px-7 text-base">أنشئ مؤسستك مجانًا <span aria-hidden="true">←</span></Link>
              <a href="#features" className="x-button-ghost min-h-14 px-7 text-base">استكشف المنصة</a>
            </Reveal>

            <Reveal delay={280} className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
              {["عربي بالكامل", "متعدد الفروع", "جاهز للجوال"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-violet-400" />{item}</span>
              ))}
            </Reveal>
          </div>

          <Reveal delay={150} className="relative mx-auto w-full max-w-[560px]">
            <div className="absolute inset-10 rounded-full bg-violet-500/20 blur-[70px]" aria-hidden="true" />
            <div className="animate-float relative rounded-[2rem] border border-white/10 bg-white/[.055] p-3 shadow-[0_35px_100px_rgba(0,0,0,.5)] sm:p-5">
              <div className="relative overflow-hidden rounded-[1.5rem] border border-violet-300/15 bg-[#0c0913] p-5 sm:p-7">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
                  <div className="flex items-center gap-3">
                    <BrandLogo className="h-14 w-14 rounded-2xl border border-violet-400/20" priority />
                    <div>
                      <p className="font-bold text-white">لوحة قيادة مؤسستك</p>
                      <p className="mt-1 text-xs text-slate-400">كل الفروع في صورة واحدة</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">مباشر</span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[{ label: "الإيرادات", value: "نمو مستمر", icon: "reports" as IconName }, { label: "الصندوق", value: "مطابق", icon: "cash" as IconName }, { label: "الحجوزات", value: "منظّمة", icon: "customers" as IconName }, { label: "الولاء", value: "أكثر تفاعلًا", icon: "loyalty" as IconName }].map((metric) => (
                    <div key={metric.label} className="rounded-2xl border border-white/[.07] bg-white/[.045] p-4">
                      <div className="flex items-center justify-between text-slate-400"><span className="text-xs">{metric.label}</span><Icon name={metric.icon} className="h-4 w-4 text-violet-400" /></div>
                      <p className="mt-3 text-sm font-bold text-white sm:text-base">{metric.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-white/[.07] bg-gradient-to-l from-violet-500/[.12] to-white/[.03] p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div><p className="text-xs text-slate-400">أداء الأسبوع</p><p className="mt-1 text-sm font-bold">رؤية واضحة لحظة بلحظة</p></div>
                    <span className="text-xs font-bold text-violet-300">+ قرارات أذكى</span>
                  </div>
                  <div className="mt-4 flex h-16 items-end gap-2" aria-hidden="true">
                    {[35, 48, 40, 62, 54, 78, 92].map((height, index) => <span key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-violet-700 to-violet-300" style={{ height: `${height}%`, opacity: .55 + index * .06 }} />)}
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-6 -right-2 rounded-2xl border border-violet-300/20 bg-[#171020] px-4 py-3 shadow-2xl sm:-right-8">
              <p className="text-[10px] text-slate-400">تجربة موحّدة</p><p className="mt-1 text-xs font-bold text-white">مالك · مدير · حلاق · عميل</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 -mt-px border-b border-violet-100 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-x-reverse divide-violet-100 px-4 py-8 sm:grid-cols-4 sm:px-6 lg:px-8">
          {[['360°', 'رؤية حول العمل'], ['24/7', 'تشغيل بلا قيود'], ['4', 'تجارب مترابطة'], ['1', 'منصة لكل الفروع']].map(([value, label]) => (
            <div key={label} className="px-3 py-3 text-center"><p className="text-2xl font-bold text-violet-700 sm:text-3xl" dir="ltr">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500 sm:text-sm">{label}</p></div>
          ))}
        </div>
      </section>

      <section id="solution" className="px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="من التشتيت إلى السيطرة" title="كل ما يحتاجه صالونك. مترابط من البداية للنهاية." description="بدل التنقل بين الدفاتر والجداول والتطبيقات، تمنحك XMANSX مصدرًا واحدًا للحقيقة يربط التشغيل اليومي بقرارات النمو." />
          <div className="mt-14 grid overflow-hidden rounded-[2rem] border border-violet-100 bg-white shadow-[0_30px_80px_-50px_rgba(48,24,95,.35)] lg:grid-cols-2">
            <div className="bg-slate-50 p-6 sm:p-9">
              <p className="text-sm font-bold text-slate-500">الطريقة التقليدية</p>
              <div className="mt-6 space-y-3">{comparison.map(([before]) => <div key={before} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"><span className="grid h-6 w-6 place-items-center rounded-full bg-red-50 text-xs text-red-500">×</span>{before}</div>)}</div>
            </div>
            <div className="relative overflow-hidden bg-[#110c1c] p-6 text-white sm:p-9">
              <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-violet-600/20 blur-3xl" aria-hidden="true" />
              <p className="relative text-sm font-bold text-violet-300">مع XMANSX</p>
              <div className="relative mt-6 space-y-3">{comparison.map(([, after]) => <div key={after} className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.045] px-4 py-3 text-sm text-slate-200"><span className="grid h-6 w-6 place-items-center rounded-full bg-violet-500/20 text-violet-300"><Icon name="check" className="h-3.5 w-3.5" /></span>{after}</div>)}</div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-violet-100 bg-white px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="منظومة متكاملة" title="وحدات تعمل معًا، لا جزر منفصلة." description="كل عملية تسجّل أثرها في بقية المنظومة تلقائيًا، لتبقى أرقامك متسقة وتجربة فريقك أبسط." />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {platformFeatures.map((feature, index) => (
              <Reveal key={feature.title} delay={(index % 4) * 70} className="group rounded-3xl border border-violet-100 bg-[#fbfaff] p-6 transition duration-300 hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_24px_50px_-30px_rgba(109,40,217,.38)]">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white shadow-[0_10px_25px_-10px_rgba(124,58,237,.8)]"><Icon name={feature.icon} className="h-6 w-6" /></span>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[9px] font-bold text-violet-600">{feature.tag}</span>
                </div>
                <h3 className="mt-6 text-lg font-bold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="journey" className="relative overflow-hidden bg-[#0b0811] px-5 py-20 text-white sm:py-28">
        <div className="x-grid absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="x-eyebrow text-violet-300">رحلة تشغيل واضحة</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">من أول إعداد إلى قرار التوسع.</h2>
            <p className="mt-5 text-base leading-8 text-slate-400 sm:text-lg">صُممت المنصة لترافق العمل كما يحدث فعلًا، وتحوّل كل خطوة يومية إلى معرفة قابلة للقياس.</p>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-4">
            {journey.map((step) => (
              <div key={step.number} className="relative bg-[#100c18] p-7 transition-colors hover:bg-[#171020]">
                <div className="flex items-center justify-between"><span className="text-3xl font-light text-violet-400/45" dir="ltr">{step.number}</span><Icon name={step.icon} className="h-6 w-6 text-violet-300" /></div>
                <h3 className="mt-12 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="قيمة لكل مستخدم" title="منصة يفهمها فريقك ويثق بها عميلك." description="لكل دور واجهة تناسب قراراته ومسؤولياته، بينما تبقى البيانات مترابطة تحت مؤسسة واحدة." />
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {audiences.map((audience, index) => (
              <Reveal key={audience.label} delay={(index % 2) * 80} className="flex gap-5 rounded-3xl border border-violet-100 bg-white p-6 shadow-[0_18px_45px_-36px_rgba(48,24,95,.4)] sm:p-8">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700"><Icon name={audience.icon} className="h-6 w-6" /></span>
                <div><p className="text-xs font-bold text-violet-600">{audience.label}</p><h3 className="mt-2 text-xl font-bold">{audience.title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{audience.description}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:pb-28">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-violet-700 via-violet-800 to-[#160b2d] px-6 py-12 text-white shadow-[0_35px_90px_-40px_rgba(91,33,182,.65)] sm:px-12 sm:py-16 lg:flex lg:items-center lg:justify-between lg:gap-14">
          <div className="x-grid absolute inset-0 opacity-20" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold tracking-[.18em] text-violet-200">XMANSX INSTITUTION</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">تقنية تحمي التفاصيل، وتكشف الصورة الكبيرة.</h2>
            <p className="mt-4 leading-8 text-violet-100/80">صلاحيات دقيقة، سجل تدقيق للعمليات الحساسة، وعزل بيانات المؤسسات — لتكبر منظومتك بثقة.</p>
          </div>
          <div className="relative mt-8 grid min-w-[280px] grid-cols-2 gap-3 lg:mt-0">
            {[['staff', 'صلاحيات حسب الدور'], ['reports', 'سجل تدقيق واضح'], ['billing', 'بيانات مالية موثوقة'], ['settings', 'عزل بين المؤسسات']].map(([icon, text]) => <div key={text} className="rounded-2xl border border-white/15 bg-white/10 p-4"><Icon name={icon as IconName} className="h-5 w-5 text-violet-200" /><p className="mt-3 text-xs font-bold">{text}</p></div>)}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-violet-100 bg-white px-5 py-20 sm:py-28">
        <div className="mx-auto max-w-4xl">
          <SectionHeading eyebrow="قبل أن تبدأ" title="أسئلة تساعدك على اتخاذ القرار." description="إجابات مباشرة عن طريقة عمل XMANSX وما الذي تضيفه إلى مؤسستك." />
          <div className="mt-12 divide-y divide-violet-100 rounded-3xl border border-violet-100 bg-[#fbfaff] px-5 sm:px-8">
            {faqs.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-bold marker:hidden sm:text-lg"><span>{faq.question}</span><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xl font-light text-violet-700 transition-transform group-open:rotate-45">+</span></summary>
                <p className="max-w-3xl pb-1 pt-4 text-sm leading-8 text-slate-600 sm:text-base">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0a0710] px-5 py-20 text-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <BrandLogo className="h-24 w-24 rounded-[1.75rem] border border-violet-400/20 shadow-[0_0_45px_rgba(124,58,237,.3)]" />
          <p className="mt-6 text-xs font-bold tracking-[.24em] text-violet-300" dir="ltr">XMANSX INSTITUTION</p>
          <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-5xl">جاهز لتدير عملك بصورة مختلفة؟</h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-400">ابدأ مؤسستك الآن، واجمع فريقك وعملاءك وأرقامك في منصة واحدة صُممت لتصنع الفرق.</p>
          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/signup" className="x-button-primary min-h-14 flex-1 px-7 text-base">ابدأ الآن</Link>
            <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" className="x-button-ghost min-h-14 flex-1 px-7 text-base">تواصل معنا</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#07050b] px-5 py-8 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-center text-xs sm:flex-row sm:text-right">
          <div className="flex items-center gap-3"><BrandLogo className="h-9 w-9 rounded-lg border border-white/10" /><div><p className="font-bold text-white">مؤسسة إكس مانس إكس</p><p className="mt-1" dir="ltr">XMANSX INSTITUTION</p></div></div>
          <p>حلول تقنية تصنع الفرق · جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
          <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" className="transition-colors hover:text-violet-300">واتساب: <span dir="ltr">{WHATSAPP_DISPLAY}</span></a>
        </div>
      </footer>
    </main>
  );
}
