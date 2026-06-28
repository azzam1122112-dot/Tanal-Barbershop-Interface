import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { Reveal } from "@/components/reveal";

const features: { icon: IconName; title: string; description: string }[] = [
  { icon: "visits", title: "تسجيل الزيارات في ثوانٍ", description: "تطبيق حلاق موبايل أولًا: الخدمة والمبلغ وطريقة الدفع بثلاث لمسات — بلا تأخير ولا طوابير على الكرسي." },
  { icon: "cash", title: "صندوق محكم بلا تسريب", description: "افتح وأغلق جلسة الصندوق وقت ما تشاء، مع كشف فوري لأي فرق بين الكاش والشبكة قبل أن يتراكم." },
  { icon: "loyalty", title: "ولاء يُعيد عملاءك", description: "نقاط ومكافآت تُحتسب وتُستبدل تلقائيًا ومشتركة بين كل فروعك — لترفع تكرار الزيارة ومتوسط الإنفاق." },
  { icon: "campaigns", title: "حملات تملأ الكراسي", description: "عروض موجّهة لشريحة محددة — عملاء جدد، منقطعون، أو أصحاب نقاط — بنسبة أو مبلغ ومدة تحدّدها أنت." },
  { icon: "whatsapp", title: "واتساب يحترم عميلك", description: "رسائل جاهزة تُرسلها يدويًا وقت تريد، بلا إرسال تلقائي أو إزعاج جماعي يعرّض رقمك للحظر." },
  { icon: "reports", title: "قرارات مبنية على أرقام", description: "مؤشرات مالية يومية وسجل تدقيق كامل لكل عملية حساسة، فتعرف أين تربح وأين تُحكم رقابتك." },
];

const steps: { title: string; description: string }[] = [
  { title: "أنشئ مؤسستك", description: "سجّل صالونك، وأضف الحلاقين والخدمات وقواعد الولاء — في دقائق وبدون أي خبرة تقنية." },
  { title: "شغّل يومك", description: "يسجّل الحلاق الزيارات من جواله، وتنساب جلسات الصندوق والتحصيل بسلاسة طوال اليوم." },
  { title: "انمُ بثقة", description: "راقب التقارير، أطلق الحملات، وأضِف فروعًا جديدة تحت مظلة مؤسسة واحدة بعزل تام." },
];

const stats: { value: string; label: string }[] = [
  { value: "دقائق", label: "لإطلاق صالونك بالكامل" },
  { value: "24/7", label: "تشغيل يناسب صالونًا بلا ورديات" },
  { value: "متعدد", label: "فروع تحت مؤسسة واحدة" },
  { value: "صفر", label: "رسائل واتساب تلقائية مزعجة" },
];

const faqs: { question: string; answer: string }[] = [
  { question: "هل أحتاج خبرة تقنية لتشغيل تنال؟", answer: "لا. الواجهة عربية بالكامل ومصمّمة لتكون بديهية. تنشئ مؤسستك وتضيف حلاقيك وخدماتك خلال دقائق، ويبدأ الحلاق العمل من جواله مباشرة." },
  { question: "هل يدعم النظام أكثر من فرع؟", answer: "نعم. تدير عدة فروع تحت مؤسسة واحدة ببرنامج ولاء مشترك، وفي الوقت نفسه عزل تام لبيانات كل مؤسسة عن غيرها." },
  { question: "كيف يعمل إرسال واتساب؟", answer: "يجهّز النظام نص الرسالة ورابطها فقط، وأنت من يرسلها يدويًا وقت تشاء. لا إرسال تلقائي ولا رسائل جماعية — احترامًا لخصوصية عميلك وتجنّبًا لحظر رقمك." },
  { question: "هل يناسب صالونًا يعمل 24 ساعة؟", answer: "تمامًا. التشغيل يقوم على جلسة الصندوق التي تُفتح وتُغلق وقت ما تشاء، لا على تاريخ يوم ثابت — فيناسب الورديات الممتدة والعمل المتواصل." },
  { question: "هل بياناتي ومبالغي آمنة؟", answer: "كل عملية حساسة تُسجَّل في سجل تدقيق كامل (من نفّذها ومتى)، والمبالغ تُحسب من مصدر واحد موثوق، والصلاحيات مضبوطة بدقة لكل دور." },
  { question: "كيف أبدأ وكم التكلفة؟", answer: "أنشئ مؤسستك الآن وجرّب النظام بنفسك، وللاستفسار عن باقات الاشتراك تواصل معنا مباشرة على واتساب وسنساعدك في اختيار ما يناسب صالونك." },
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
              <p className="text-[10px] font-bold uppercase tracking-eyebrow text-salon-gold">واجهة تنال</p>
              <p className="text-sm font-bold text-salon-ink">منصّة الحلاقة الرجالية</p>
            </div>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-bold text-salon-charcoal md:flex">
            <a href="#features" className="transition-colors hover:text-salon-ink">المزايا</a>
            <a href="#how" className="transition-colors hover:text-salon-ink">كيف يعمل</a>
            <a href="#faq" className="transition-colors hover:text-salon-ink">الأسئلة الشائعة</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/login" className="dashboard-button-soft px-3 py-2 text-xs sm:px-4 sm:text-sm">دخول</Link>
            <Link href="/signup" className="dashboard-button-gold sheen-overlay px-3 py-2 text-xs sm:px-4 sm:text-sm">أنشئ مؤسستك</Link>
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
              نظام تشغيل وولاء للصالونات الرجالية
            </Reveal>

            <Reveal as="h1" delay={80} className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight md:text-6xl">
              أدِر صالونك باحتراف،
              <br />
              <span className="text-gold-sheen">واربح أكثر مع كل زيارة</span>
            </Reveal>

            <Reveal as="p" delay={160} className="mt-6 max-w-xl text-lg leading-8 text-white/70">
              تنال يجمع تسجيل الزيارات، إدارة الصندوق، برنامج الولاء، والحملات في منصّة عربية واحدة —
              تُعيد عملاءك، تُحكم رقابتك على التحصيل، وتنمو بفروعك بثقة من أول يوم.
            </Reveal>

            <Reveal delay={240} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="dashboard-button-gold sheen-overlay px-7 py-4 text-base">
                <Icon name="loyalty" className="h-5 w-5" />
                ابدأ مجانًا الآن
              </Link>
              <Link href="/barber/login" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-7 py-4 text-base font-bold text-white backdrop-blur transition-[transform,background-color] duration-200 hover:bg-white/[0.12] active:scale-[0.99]">
                <Icon name="scissors" className="h-5 w-5" />
                دخول الحلاقين
              </Link>
            </Reveal>

            <Reveal as="p" delay={320} className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-medium text-white/45">
              <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-salon-goldlight" /> جاهز خلال دقائق</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-salon-goldlight" /> بلا إرسال واتساب تلقائي</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="check" className="h-4 w-4 text-salon-goldlight" /> عزل تام بين المؤسسات</span>
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

      {/* ===== FAQ ===== */}
      <section id="faq" className="border-t border-salon-line/60 bg-gradient-to-b from-[#f6f3ec] to-[#efe9dd]">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <Reveal className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">قبل أن تبدأ</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-salon-ink md:text-4xl">أسئلة شائعة</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-salon-charcoal">
              كل ما تريد معرفته قبل تشغيل تنال في صالونك. لم تجد إجابتك؟ راسلنا على واتساب.
            </p>
          </Reveal>

          <div className="mt-10 space-y-3">
            {faqs.map((faq, index) => (
              <Reveal key={faq.question} delay={index * 60}>
                <details className="dashboard-panel group overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-bold text-salon-ink sm:px-6">
                    {faq.question}
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-salon-ink text-salon-gold transition-transform duration-300 group-open:rotate-45">
                      <Icon name="close" className="h-3.5 w-3.5 rotate-45" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-8 text-salon-charcoal sm:px-6">{faq.answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
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
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">صالونك يستحق نظامًا بمستواه</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">أنشئ مؤسستك اليوم مجانًا، وابدأ تسجيل أول زيارة خلال دقائق — بدون تعقيد وبدون التزام.</p>

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
              <Link href="/signup" className="dashboard-button-gold sheen-overlay px-8 py-4 text-base">أنشئ مؤسستك</Link>
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
            <span className="font-bold text-salon-ink">واجهة تنال</span>
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
