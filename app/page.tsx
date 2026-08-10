import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/format";
import { getDefaultSignupPlan, listPublicPlans } from "@/lib/plans/subscription-service";
import { serializeJsonForHtml } from "@/lib/security/serialization";
import { legalInfo, supportWhatsAppLink } from "@/lib/legal";

const WHATSAPP_DISPLAY = legalInfo.supportPhone;
const WHATSAPP_LINK = supportWhatsAppLink("السلام عليكم، أرغب بالاستفسار عن منصة XMANSX لإدارة صالونات الحلاقة.");

const DEFAULT_TRIAL_DAYS = 14;

export const metadata: Metadata = {
  title: "منصة تشغيل صالونات الحلاقة الرجالية",
  description: "نظام عربي واحد لصالون الحلاقة: صندوق يُقفل بفروقات مفسّرة، عمولات تُحسب لحظة الزيارة، إيصالات وسجل مالي، ولاء وحجوزات وتقارير لكل الفروع. تجربة مجانية بدون بطاقة بنكية.",
  keywords: [
    "برنامج إدارة صالون حلاقة",
    "نظام صالون رجالي",
    "كاشير صالون حلاقة",
    "إيصالات صالون حلاقة",
    "برنامج ولاء صالون",
    "إدارة عمولات الحلاقين",
    "XMANSX",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: "XMANSX",
    title: "XMANSX · منصة تشغيل صالونات الحلاقة الرجالية",
    description: "صندوق مضبوط، عمولات دقيقة، إيصالات واضحة، وولاء يُرجع الزبون. تجربة مجانية بدون بطاقة بنكية.",
  },
  twitter: {
    card: "summary_large_image",
    title: "XMANSX · منصة تشغيل صالونات الحلاقة الرجالية",
    description: "صندوق مضبوط، عمولات دقيقة، إيصالات واضحة، وولاء يُرجع الزبون. تجربة مجانية بدون بطاقة بنكية.",
  },
};

// الصفحة عامة وثقيلة بصريًا لكن بياناتها بطيئة التغيّر. ISR يمنع استعلام
// PostgreSQL مع كل زيارة، وتُبطَل النسخة فور تعديل الباقات من لوحة المنصة.
export const revalidate = 300;

/* ————————————————————————————————————————————————
   المحتوى
   كل ادعاء هنا مقابله سلوك حقيقي في الكود. لا تُضِف بندًا لا تستطيع أن تفتح
   الملف الذي ينفّذه — الصفحة التي تعِد بما لا يوجد تُكلّف ثقة لا تُسترد.
   ———————————————————————————————————————————————— */

const trustBar: { value: string; label: string; ltr?: boolean }[] = [
  { value: "تجربة مجانية", label: "تجربة كاملة بدون بطاقة بنكية" },
  { value: "0%", label: "عمولة على مبيعاتك — اشتراك فقط", ltr: true },
  { value: "سجل كامل", label: "إيصال واضح لكل زيارة" },
  { value: "4 واجهات", label: "مالك · مدير · حلاق · زبون" },
];

/** الوجع الحقيقي في صالون رجالي، لا «تحدّيات الأعمال» العامة. */
const painPairs: { before: string; after: string }[] = [
  {
    before: "آخر الدوام الدرج ناقص 300 ريال ولا أحد يعرف السبب",
    after: "جلسة صندوق تُفتح وتُقفل بمصروفات مسجّلة وفرق مفسَّر لا عجز غامض",
  },
  {
    before: "عمولات الحلاقين تُحسب على ورقة آخر الشهر وتنتهي بخلاف",
    after: "عمولة كل زيارة تُحسب لحظتها وتُحفظ بنسبتها، فتغيير النسب لا يمسّ المستحق القديم",
  },
  {
    before: "زبون دائم انقطع ثلاثة أشهر ولم ينتبه أحد",
    after: "تنبيه بالعملاء المنقطعين ورسالة واتساب جاهزة لإرجاعهم",
  },
  {
    before: "زيارة تمّت والمبلغ لم يُسجَّل، والتعديل بعدها بلا أثر",
    after: "لا زيارة بلا صندوق مفتوح، وكل تعديل حسّاس مسجَّل باسم صاحبه ووقته",
  },
  {
    before: "تفاصيل الزيارة موزعة بين الورق والجوال ولا يوجد مرجع واحد",
    after: "رقم إيصال متسلسل وسجل خدمة ومبلغ ودفع محفوظ لكل زيارة",
  },
  {
    before: "كل فرع يشتغل بطريقته ولا تعرف أيّهما يربح فعلًا",
    after: "فروع تحت مؤسسة واحدة بأرقام قابلة للمقارنة من شاشة واحدة",
  },
];

const platformFeatures: { icon: IconName; title: string; description: string; tag: string }[] = [
  {
    icon: "visits",
    title: "الزيارة والمبيعات",
    description: "الخدمة والمبلغ والخصم وطريقة الدفع في شاشة واحدة، مع منتجات تُباع مع الزيارة وسجل لكل تعديل.",
    tag: "تشغيل يومي",
  },
  {
    icon: "cash",
    title: "الصندوق والمصروفات",
    description: "جلسة تُفتح ببداية الوردية وتُقفل بمطابقة الكاش، والمصروف النثري يُخصم فيظهر الفرق مفسَّرًا.",
    tag: "رقابة مالية",
  },
  {
    icon: "billing",
    title: "الإيصالات والسجل المالي",
    description: "ترقيم تسلسلي لكل فرع، وتفصيل الخدمة والخصم والدفع في إيصال يمكن طباعته أو إرساله للزبون.",
    tag: "مرجع واضح",
  },
  {
    icon: "customers",
    title: "الزبائن والحجوزات",
    description: "ملف موحّد لكل زبون، وبوابة خاصة به يحجز منها ويتابع ويلغي من جواله بلا تطبيق ولا تسجيل.",
    tag: "تجربة الزبون",
  },
  {
    icon: "loyalty",
    title: "النقاط والمكافآت",
    description: "نقاط تُحتسب على المبلغ المعتمد، وقواعد استبدال منضبطة تعمل بين كل فروع النشاط.",
    tag: "تكرار الزيارة",
  },
  {
    icon: "barbers",
    title: "الحلاقون والعمولات",
    description: "حضور الوردية، أداء كل حلاق، نقله بين الفروع، وعمولة محسوبة على المبلغ بعد الخصم.",
    tag: "إدارة الفريق",
  },
  {
    icon: "services",
    title: "الخدمات والمخزون",
    description: "أسعار الخدمات والمنتجات، وخصم مخزون داخل معاملة الزيارة نفسها مع حركة مسجَّلة لكل تغيير.",
    tag: "سيطرة كاملة",
  },
  {
    icon: "reports",
    title: "التقارير والفروع",
    description: "الإيراد والخصومات وأداء الخدمات والحلاقين، ومقارنة مباشرة بين الفروع في شاشة واحدة.",
    tag: "قرار بالأرقام",
  },
];

/** ما يجعلها مصمّمة لواقع الكرسي لا لمكتب إداري. */
const fieldReality: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "scissors",
    title: "تُثبَّت على جوال الحلاق كتطبيق",
    description:
      "أيقونة على الشاشة الرئيسية وشاشة عمل تفتح مباشرة على البحث بالجوال — بلا متجر تطبيقات وبلا جهاز خاص.",
  },
  {
    icon: "bell",
    title: "تنبّهك عند انقطاع الشبكة",
    description:
      "المبالغ والأرصدة لا تُخزَّن محليًا أبدًا. الجهاز مشترك بين حلاقين، ورقم من نسخة قديمة خطأ تشغيلي لا تحسين سرعة.",
  },
  {
    icon: "staff",
    title: "دخول بالجوال ورمز PIN",
    description: "الحلاق لا يحفظ كلمة مرور ولا يصل للوحة الإدارة. مدير الفرع يرى الفروع المسندة له فقط.",
  },
  {
    icon: "cash",
    title: "الصندوق هو القفل، لا التاريخ",
    description:
      "لا تُسجَّل زيارة بلا جلسة صندوق مفتوحة. يناسب الورديات الممتدة بعد منتصف الليل بلا يوم محاسبي مكسور.",
  },
];

const journey: { number: string; icon: IconName; title: string; description: string }[] = [
  {
    number: "01",
    icon: "settings",
    title: "جهّز صالونك",
    description: "أضف الفرع والخدمات وأسعارها والحلاقين ونِسَبهم وقواعد النقاط، واضبط صلاحية كل مستخدم.",
  },
  {
    number: "02",
    icon: "visits",
    title: "شغّل يومك",
    description: "الحلاق يسجّل حضوره، يفتح الصندوق، يستقبل الحجز، يسجّل الخدمة والمبلغ، ويصدر الفاتورة.",
  },
  {
    number: "03",
    icon: "reports",
    title: "أقفل بثقة",
    description: "مطابقة الكاش والشبكة، مصروفات اليوم، مستحقات الحلاقين، وإغلاق يومي محفوظ كمرجع.",
  },
  {
    number: "04",
    icon: "campaigns",
    title: "أرجع زبائنك",
    description: "شرائح جاهزة للمنقطعين وأصحاب المكافآت الجاهزة، ورسالة واتساب تُرسل بيدك لا تلقائيًا.",
  },
];

const audiences: { icon: IconName; label: string; title: string; description: string }[] = [
  {
    icon: "staff",
    label: "للمالك",
    title: "فروعك في شاشة واحدة",
    description: "إيراد كل فرع، فروقات الصندوق، مستحقات الحلاقين، وصلاحيات تحدّد من يرى الأرقام ومن يعدّلها.",
  },
  {
    icon: "reports",
    label: "للمدير",
    title: "تعرف بالمشكلة قبل نهاية اليوم",
    description: "تنبيهات نفاد المخزون وانخفاض أداء حلاق وتكرار فروقات الصندوق — ولكل تنبيه رابط إجراء مباشر.",
  },
  {
    icon: "scissors",
    label: "للحلاق",
    title: "لا تُبعده عن كرسيه",
    description: "شاشة جوال مختصرة: يبحث بالجوال، يسجّل الزيارة، يستلم المبلغ، ويكمل. بلا تدريب طويل.",
  },
  {
    icon: "customers",
    label: "للزبون",
    title: "يحجز ويتابع من جواله",
    description: "رابط خاص به يحجز منه ويلغي ويرى نقاطه ومكافآته وسجل زياراته عبر كل الفروع.",
  },
];

const faqs: { question: string; answer: string }[] = [
  {
    question: "كم تكلفة المنصة؟",
    answer: "تبدأ بتجربة كاملة بدون بطاقة بنكية ولا التزام، ومدتها هي المعلنة في الصفحة وقت التسجيل. بعدها تختار من الباقات والأسعار المنشورة حسب عدد الفروع والحلاقين. لا نأخذ نسبة من مبيعاتك ولا من حجوزاتك — اشتراك ثابت فقط.",
  },
  {
    question: "كم يستغرق تشغيلها في صالوني؟",
    answer:
      "تُنشئ مؤسستك وفرعك من صفحة البدء مباشرة. الوقت الفعلي يذهب إلى إدخال خدماتك وأسعارك وحلاقيك ونِسَب عمولاتهم، وهي خطوة تُدخَل مرة واحدة. واجهة الحلاق لا تحتاج تدريبًا حقيقيًا لأنها شاشة واحدة بخطوات متتابعة.",
  },
  {
    question: "هل تدعم المنصة ZATCA أو الربط مع منصة فاتورة؟",
    answer:
      "لا. XMANSX تصدر إيصال زيارة تشغيليًا وسجلًا ماليًا داخليًا فقط، ولا تدّعي التوافق مع ZATCA أو الربط والتكامل معها. يبقى على الصالون استخدام حل فوترة ضريبية معتمد متى كان ملزمًا بذلك.",
  },
  {
    question: "ماذا يحدث لو انقطع الإنترنت أثناء العمل؟",
    answer:
      "تظهر للحلاق رسالة انقطاع واضحة فورًا. لا نعرض له مبلغًا أو رصيد نقاط من نسخة محفوظة — الجهاز غالبًا مشترك بين أكثر من حلاق، ورقم قديم يبدو صحيحًا أخطر من رسالة انقطاع صريحة. يستأنف العمل فور عودة الشبكة.",
  },
  {
    question: "هل يستطيع الحلاق رؤية الأرباح أو تعديل زيارة قديمة؟",
    answer:
      "لا. الحلاق يدخل بواجهته فقط ولا يصل إلى لوحة الإدارة ولا إلى تقارير الإيراد. تعديل أو إلغاء أي زيارة صلاحية إدارية، ويُسجَّل في سجل تدقيق يحفظ من نفّذ العملية ومتى وما القيمة قبلها وبعدها.",
  },
  {
    question: "هل تناسب أكثر من فرع؟",
    answer:
      "نعم، وهذا أحد أسبابها. الفروع تعمل تحت مؤسسة واحدة، فيجمع الزبون نقاطه من أي فرع ويستبدلها في أي فرع، بينما تقارن أنت أداء الفروع من شاشة واحدة. ويمكنك تقييد كل مدير فرع بالفروع المسندة له فلا يرى أرقام غيرها.",
  },
  {
    question: "كيف يعمل واتساب داخل المنصة؟",
    answer:
      "تختار الشريحة — منقطعون، أصحاب مكافآت جاهزة، جمهور حملة — فتُجهّز المنصة نص الرسالة ورابط المحادثة، ثم ترسلها بيدك. لا إرسال جماعي تلقائي: هو ما يُعرّض رقم الصالون للحظر ويُزعج الزبون.",
  },
  {
    question: "ماذا يحدث لبياناتي إذا انتهى الاشتراك؟",
    answer:
      "انتهاء الاشتراك يوقف التشغيل — تسجيل الزيارات وفتح الصندوق — ولا يقطع دخولك للوحة. تبقى قادرًا على قراءة تقاريرك وبيانات زبائنك وتجديد اشتراكك متى شئت.",
  },
];

const securityPoints: { icon: IconName; text: string }[] = [
  { icon: "staff", text: "صلاحيات حسب الدور والفرع" },
  { icon: "reports", text: "سجل تدقيق لكل عملية حسّاسة" },
  { icon: "billing", text: "مطابقة مالية قابلة للمراجعة" },
  { icon: "settings", text: "عزل كامل بين المؤسسات" },
];

/* ———————————————————————————————————————————————— */

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "center" | "start";
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="x-eyebrow">{eyebrow}</p>
      <h2 className={`x-h2 x-balance mt-4 font-bold ${centered ? "" : ""}`}>{title}</h2>
      <p className={`x-lead mt-5 max-w-2xl text-slate-600 ${centered ? "mx-auto" : ""}`}>{description}</p>
    </div>
  );
}

export default async function HomePage() {
  const [publicPlans, signupPlan] = await Promise.all([listPublicPlans(prisma), getDefaultSignupPlan(prisma)]);
  const trialDays = signupPlan?.trialDays ?? DEFAULT_TRIAL_DAYS;
  const pageTrustBar = trustBar.map((item, index) => (index === 0 ? { ...item, value: `${trialDays} يومًا` } : item));
  const pageFaqs = faqs.map((faq, index) =>
    index === 0
      ? {
          ...faq,
          answer: `تبدأ بـ ${trialDays} يومًا تجربة كاملة بدون بطاقة بنكية ولا التزام. بعدها تختار من الباقات والأسعار المنشورة في هذه الصفحة حسب عدد الفروع والحلاقين. لا نأخذ نسبة من مبيعاتك ولا من حجوزاتك — اشتراك ثابت فقط.`,
        }
      : faq,
  );
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pageFaqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "XMANSX",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "ar",
    description:
      "منصة عربية لتشغيل صالونات الحلاقة الرجالية: الزيارات والصندوق والإيصالات والحجوزات والولاء والعمولات والمخزون والتقارير.",
    offers: [
      {
        "@type": "Offer",
        name: "التجربة المجانية",
        price: "0",
        priceCurrency: "SAR",
        description: `تجربة مجانية ${trialDays} يومًا بدون بطاقة بنكية`,
      },
      ...publicPlans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: String(plan.priceMonthly),
        priceCurrency: "SAR",
        description: plan.description ?? `اشتراك ${plan.name} الشهري`,
      })),
    ],
  };

  return (
    <main className="x-site min-h-screen overflow-x-hidden text-salon-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(productJsonLd) }} />

      {/* ===== الترويسة ===== */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-salon-onyx/95 text-white shadow-[0_10px_40px_rgba(9,7,15,.16)] backdrop-blur-[2px]">
        <div className="x-shell flex items-center justify-between gap-3 py-2.5 sm:gap-4 sm:py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="العودة إلى الصفحة الرئيسية">
            <BrandLogo
              className="h-10 w-10 rounded-xl border border-salon-goldlight/20 shadow-[0_0_22px_rgba(139,92,246,.2)] sm:h-11 sm:w-11"
              priority
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold tracking-[0.12em] sm:text-base" dir="ltr">
                XMANSX
              </p>
              <p
                className="hidden text-[9px] font-semibold uppercase tracking-[0.28em] text-salon-goldlight sm:block"
                dir="ltr"
              >
                SOFTWARE SERVICE
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-5 text-sm font-semibold text-white/70 md:flex lg:gap-7">
            <a className="transition-colors hover:text-white" href="#solution">
              لماذا XMANSX
            </a>
            <a className="transition-colors hover:text-white" href="#features">
              الإمكانات
            </a>
            <a className="transition-colors hover:text-white" href="#field">
              داخل الصالون
            </a>
            <a className="transition-colors hover:text-white" href="#pricing">
              الباقات
            </a>
            <a className="transition-colors hover:text-white" href="#faq">
              الأسئلة
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 w-10 place-items-center rounded-xl border border-white/15 text-white/70 transition-colors hover:border-salon-goldlight/45 hover:text-white sm:grid"
              aria-label="تواصل معنا عبر واتساب"
            >
              <Icon name="whatsapp" className="h-5 w-5" />
            </a>
            <Link href="/dashboard/login" className="x-button-ghost px-3 text-xs sm:px-5 sm:text-sm">
              <span className="sm:hidden">دخول</span>
              <span className="hidden sm:inline">تسجيل الدخول</span>
            </Link>
            <Link href="/signup" className="x-button-primary px-3 text-xs sm:px-5 sm:text-sm">
              <span className="sm:hidden">ابدأ</span>
              <span className="hidden sm:inline">ابدأ مجانًا</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ===== الواجهة البطولية ===== */}
      <section className="x-hero relative isolate overflow-hidden text-white">
        <div className="x-grid absolute inset-0 opacity-30" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-40 -top-48 h-[38rem] w-[38rem] rounded-full bg-violet-600/25 blur-[120px]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-64 -left-24 h-[36rem] w-[36rem] rounded-full bg-fuchsia-600/15 blur-[130px]"
          aria-hidden="true"
        />

        <div className="x-shell relative grid items-center gap-12 pb-16 pt-12 sm:gap-14 sm:pb-24 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
          <div>
            <Reveal
              as="p"
              className="inline-flex items-center gap-2 rounded-full border border-salon-goldlight/25 bg-salon-goldlight/[.08] px-3.5 py-2 text-[11px] font-bold text-salon-goldlight sm:px-4 sm:text-xs"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_14px_3px_rgba(167,139,250,.7)]" />
              {trialDays} يومًا مجانًا · بدون بطاقة بنكية
            </Reveal>

            <Reveal as="h1" delay={70} className="x-h1 x-balance mt-6 font-bold sm:mt-7">
              صالونك يشتغل بانضباط.
              <br />
              <span className="x-gradient-text">وأرقامك تقول لك لماذا.</span>
            </Reveal>

            <Reveal as="p" delay={140} className="x-lead mt-5 max-w-2xl text-slate-300 sm:mt-6">
              نظام عربي واحد لصالون الحلاقة الرجالي: صندوق يُقفل بفرق مفسَّر، عمولات تُحسب لحظة الزيارة، إيصال واضح
              لكل عملية، ونقاط تُرجع الزبون إلى كرسيك.
            </Reveal>

            <Reveal delay={210} className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Link href="/signup" className="x-button-primary min-h-[3.25rem] px-6 text-[0.95rem] sm:min-h-14 sm:px-7 sm:text-base">
                ابدأ {trialDays} يومًا مجانًا <span aria-hidden="true">←</span>
              </Link>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="x-button-ghost min-h-[3.25rem] px-6 text-[0.95rem] sm:min-h-14 sm:px-7 sm:text-base"
              >
                <Icon name="whatsapp" className="h-5 w-5" aria-hidden="true" />
                تحدّث معنا في واتساب
              </a>
            </Reveal>

            <Reveal delay={280} className="mt-7 flex flex-wrap gap-x-5 gap-y-2.5 text-[13px] text-slate-400 sm:mt-8 sm:text-sm">
              {["عربي RTL بالكامل", "إيصال وسجل لكل زيارة", "يعمل من أي جوال", "متعدد الفروع"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Icon name="check" className="h-4 w-4 shrink-0 text-violet-400" aria-hidden="true" />
                  {item}
                </span>
              ))}
            </Reveal>
          </div>

          {/* لقطة توضيحية للوحة — معلَّمة كعرض توضيحي، وأرقامها ليست بيانات عميل. */}
          <Reveal delay={150} className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
            <div className="absolute inset-10 rounded-full bg-violet-500/20 blur-[70px]" aria-hidden="true" />
            <div className="animate-float relative rounded-[2rem] border border-white/10 bg-white/[.055] p-2.5 shadow-[0_35px_100px_rgba(0,0,0,.5)] sm:p-4">
              <div className="relative overflow-hidden rounded-[1.5rem] border border-violet-300/15 bg-[#0c0913] p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4 sm:gap-4 sm:pb-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <BrandLogo className="h-11 w-11 shrink-0 rounded-2xl border border-salon-goldlight/20 sm:h-14 sm:w-14" priority />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white sm:text-base">إغلاق وردية المساء</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400 sm:text-xs">فرع الملز · اليوم</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                    مطابق
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3">
                  {[
                    { label: "كاش", value: "2,480", icon: "cash" as IconName },
                    { label: "شبكة", value: "3,150", icon: "billing" as IconName },
                    { label: "مصروفات", value: "120", icon: "adjustments" as IconName },
                    { label: "الفرق", value: "0", icon: "check" as IconName },
                  ].map((metric) => (
                    <div key={metric.label} className="rounded-2xl border border-white/[.07] bg-white/[.045] p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-2 text-slate-400">
                        <span className="truncate text-[11px] sm:text-xs">{metric.label}</span>
                        <Icon name={metric.icon} className="h-4 w-4 shrink-0 text-violet-400" aria-hidden="true" />
                      </div>
                      <p className="mt-2.5 text-sm font-black text-white sm:text-base" dir="ltr">
                        {metric.value} <span className="text-[10px] font-semibold text-slate-400">SAR</span>
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-white/[.07] bg-gradient-to-l from-violet-500/[.12] to-white/[.03] p-3.5 sm:mt-5 sm:p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-400 sm:text-xs">إيراد الأسبوع</p>
                      <p className="mt-1 truncate text-sm font-bold">اتجاه صاعد بلا فروقات</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-salon-goldlight sm:text-xs">7 أيام</span>
                  </div>
                  <div className="mt-3.5 flex h-14 items-end gap-1.5 sm:h-16 sm:gap-2" aria-hidden="true">
                    {[35, 48, 40, 62, 54, 78, 92].map((height, index) => (
                      <span
                        key={index}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-violet-700 to-violet-300"
                        style={{ height: `${height}%`, opacity: 0.55 + index * 0.06 }}
                      />
                    ))}
                  </div>
                </div>

                <p className="mt-3 text-center text-[10px] text-slate-500">عرض توضيحي للواجهة — أرقامه للتوضيح فقط</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== شريط الثقة ===== */}
      <section className="relative z-10 -mt-px border-b border-salon-line bg-white">
        <div className="x-shell grid grid-cols-2 gap-y-5 py-7 sm:grid-cols-4 sm:gap-y-0 sm:py-8">
            {pageTrustBar.map((item) => (
            <div
              key={item.label}
              className="px-2 text-center sm:border-l sm:border-salon-line sm:px-3 sm:last:border-l-0"
            >
              <p className="text-xl font-black text-violet-700 sm:text-2xl lg:text-3xl" dir={item.ltr ? "ltr" : undefined}>
                {item.value}
              </p>
              <p className="mt-1.5 text-[11px] font-semibold leading-5 text-slate-500 sm:text-xs lg:text-sm">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== الوجع مقابل الحل ===== */}
      <section id="solution" className="scroll-mt-24 py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <SectionHeading
            eyebrow="من الفوضى إلى الانضباط"
            title="ست مشاكل يعرفها كل صاحب صالون. ولكلٍّ منها جواب."
            description="هذه ليست قائمة مزايا عامة — هي ما يحدث فعلًا آخر الدوام، وما يفعله النظام حياله."
          />

          <div className="mt-10 overflow-hidden rounded-3xl border border-salon-line bg-white shadow-[0_30px_80px_-50px_rgba(48,24,95,.35)] sm:mt-14">
            <div className="hidden grid-cols-2 border-b border-salon-line md:grid">
              <p className="px-6 py-4 text-sm font-bold text-slate-500 lg:px-8">اليوم بدون نظام</p>
              <p className="border-r border-white/10 bg-[#110c1c] px-6 py-4 text-sm font-bold text-salon-goldlight lg:px-8">
                مع XMANSX
              </p>
            </div>

            <div className="divide-y divide-salon-line">
              {painPairs.map((pair) => (
                <div key={pair.before} className="grid md:grid-cols-2">
                  <div className="flex items-start gap-3 bg-slate-50/70 px-5 py-4 sm:px-6 lg:px-8">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-bold text-red-500" aria-hidden="true">
                      ×
                    </span>
                    <p className="x-body text-slate-500">{pair.before}</p>
                  </div>
                  <div className="flex items-start gap-3 border-r-0 bg-[#110c1c] px-5 py-4 text-slate-200 sm:px-6 md:border-r md:border-white/10 lg:px-8">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/20 text-salon-goldlight" aria-hidden="true">
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                    <p className="x-body">{pair.after}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== الإمكانات ===== */}
      <section id="features" className="scroll-mt-24 border-y border-salon-line bg-white py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <SectionHeading
            eyebrow="منظومة واحدة"
            title="وحدات تعمل معًا، لا جزر منفصلة."
            description="الزيارة الواحدة تحرّك المخزون والنقاط والعمولة والفاتورة والصندوق في اللحظة نفسها — أو لا تُحفظ أصلًا."
          />
          <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
            {platformFeatures.map((feature, index) => (
              <Reveal
                key={feature.title}
                delay={(index % 4) * 70}
                className="rounded-2xl border border-salon-line bg-salon-pearl p-5 transition duration-300 hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_24px_50px_-30px_rgba(109,40,217,.38)] sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-[0_10px_25px_-10px_rgba(124,58,237,.8)] sm:h-12 sm:w-12">
                    <Icon name={feature.icon} className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-600">
                    {feature.tag}
                  </span>
                </div>
                <h3 className="x-h3 mt-5 font-bold">{feature.title}</h3>
                <p className="x-body mt-2.5 text-slate-600">{feature.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== داخل الصالون ===== */}
      <section id="field" className="scroll-mt-24 py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-start lg:gap-16">
            <SectionHeading
              align="start"
              eyebrow="مصمَّم لواقع الكرسي"
              title="بُنيت من داخل الصالون، لا من مكتب إداري."
              description="القرارات الصغيرة هنا هي الفرق بين نظام يُستعمل ونظام يُهجر بعد أسبوعين."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {fieldReality.map((item, index) => (
                <Reveal
                  key={item.title}
                  delay={(index % 2) * 80}
                  className="rounded-2xl border border-salon-line bg-white p-5 shadow-[0_18px_45px_-36px_rgba(48,24,95,.4)] sm:p-6"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700">
                    <Icon name={item.icon} className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="x-h3 mt-4 font-bold">{item.title}</h3>
                  <p className="x-body mt-2.5 text-slate-600">{item.description}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== الإيصالات والسجل المالي ===== */}
      <section className="bg-white py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <div className="overflow-hidden rounded-3xl border border-salon-line bg-salon-pearl lg:grid lg:grid-cols-[1.15fr_.85fr]">
            <div className="p-6 sm:p-10 lg:p-12">
              <p className="x-eyebrow">مرجع كل عملية</p>
              <h2 className="x-h2 x-balance mt-4 font-bold">كل زيارة لها سجل وإيصال واضح.</h2>
              <p className="x-lead mt-4 text-slate-600">
                تُحفظ الخدمة والخصم وطريقة الدفع في مسار واحد، فيرجع المالك أو الزبون إلى مرجع مفهوم بلا ادعاء أنه
                فاتورة ضريبية أو حل ZATCA.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "رقم إيصال تسلسلي لكل فرع ولكل سنة يصدر داخل معاملة الزيارة.",
                  "تفصيل الخدمات والمنتجات والخصم وطريقة الدفع والمبلغ النهائي.",
                  "إمكانية الطباعة أو الحفظ PDF من المتصفح وإرسال المرجع للزبون.",
                  "الإيصال تشغيلي وليس فاتورة ضريبية، والمنصة لا تدعم ZATCA أو الربط معها.",
                  "كل تعديل أو إلغاء حساس يبقى ظاهرًا في سجل التدقيق.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-600 text-white" aria-hidden="true">
                      <Icon name="check" className="h-3 w-3" />
                    </span>
                    <span className="x-body text-slate-600">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative flex items-center justify-center bg-[#110c1c] p-8 sm:p-10">
              <div className="x-grid absolute inset-0 opacity-20" aria-hidden="true" />
              <div className="relative w-full max-w-[17rem] rounded-2xl bg-white p-5 text-salon-ink shadow-2xl">
                <div className="flex items-center justify-between border-b border-dashed border-salon-line pb-3">
                  <p className="text-xs font-bold">إيصال زيارة</p>
                  <BrandLogo className="h-8 w-8 rounded-lg" />
                </div>
                <div className="mt-3 space-y-1.5 text-[11px] text-salon-charcoal">
                  <div className="flex justify-between gap-2">
                    <span>رقم الإيصال</span>
                    <span dir="ltr" className="font-bold text-salon-ink">
                      2026-000418
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>الخدمات</span>
                    <span dir="ltr" className="font-bold text-salon-ink">
                      75.00
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>الخصم</span>
                    <span dir="ltr" className="font-bold text-salon-ink">
                      0.00
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-salon-line pt-3">
                  <span className="text-xs font-bold">المدفوع</span>
                  <span dir="ltr" className="text-lg font-black text-violet-700">
                    75.00
                  </span>
                </div>
                <p className="mt-4 rounded-lg bg-violet-50 px-3 py-2 text-center text-[10px] font-bold text-violet-800">
                  إيصال تشغيلي قابل للطباعة · ليس فاتورة ضريبية
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== رحلة التشغيل ===== */}
      <section id="journey" className="x-hero relative scroll-mt-24 overflow-hidden py-16 text-white sm:py-24 lg:py-28">
        <div className="x-grid absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="x-shell relative">
          <div className="max-w-3xl">
            <p className="x-eyebrow text-salon-goldlight">يوم عمل كامل</p>
            <h2 className="x-h2 x-balance mt-4 font-bold">من فتح الصندوق إلى قرار التوسّع.</h2>
            <p className="x-lead mt-5 text-slate-400">
              أربع خطوات تتبع ما يحدث فعلًا في الصالون، وتحوّل كل يوم إلى رقم يمكن الاستناد إليه.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
            {journey.map((step) => (
              <div key={step.number} className="relative bg-[#100c18] p-6 transition-colors hover:bg-[#171020] sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-light text-violet-400/45" dir="ltr">
                    {step.number}
                  </span>
                  <Icon name={step.icon} className="h-6 w-6 text-salon-goldlight" aria-hidden="true" />
                </div>
                <h3 className="mt-8 text-lg font-bold sm:mt-12 sm:text-xl">{step.title}</h3>
                <p className="x-body mt-2.5 text-slate-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الأدوار ===== */}
      <section className="py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <SectionHeading
            eyebrow="لكل دور واجهته"
            title="نظام يفهمه فريقك ويثق به زبونك."
            description="الحلاق لا يرى ما لا يخصّه، والمالك لا ينتظر أحدًا ليعرف رقمه، والزبون لا يحتاج تطبيقًا يُنزّله."
          />
          <div className="mt-10 grid gap-4 sm:mt-14 sm:gap-5 md:grid-cols-2">
            {audiences.map((audience, index) => (
              <Reveal
                key={audience.label}
                delay={(index % 2) * 80}
                className="flex gap-4 rounded-2xl border border-salon-line bg-white p-5 shadow-[0_18px_45px_-36px_rgba(48,24,95,.4)] sm:gap-5 sm:p-7"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 sm:h-12 sm:w-12">
                  <Icon name={audience.icon} className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-violet-600">{audience.label}</p>
                  <h3 className="x-h3 mt-1.5 font-bold">{audience.title}</h3>
                  <p className="x-body mt-2.5 text-slate-600">{audience.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الأمان ===== */}
      <section className="pb-16 sm:pb-24 lg:pb-28">
        <div className="x-shell">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-violet-800 to-[#160b2d] px-6 py-10 text-white shadow-[0_35px_90px_-40px_rgba(91,33,182,.65)] sm:px-10 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-12">
            <div className="x-grid absolute inset-0 opacity-20" aria-hidden="true" />
            <div className="relative max-w-2xl">
              <p className="text-[11px] font-bold tracking-[.18em] text-salon-goldlight" dir="ltr">
                XMANSX SOFTWARE SERVICE
              </p>
              <h2 className="x-h2 x-balance mt-4 font-bold">من يرى الأرقام، ومن يستطيع تغييرها.</h2>
              <p className="x-lead mt-4 text-violet-100/85">
                صلاحيات حسب الدور والفرع، وسجل تدقيق يحفظ من نفّذ كل عملية حسّاسة ومتى وما القيمة قبلها وبعدها. أنت تعرف
                دائمًا من فعل ماذا.
              </p>
            </div>
            <div className="relative mt-8 grid grid-cols-2 gap-3 lg:mt-0 lg:min-w-[19rem]">
              {securityPoints.map((point) => (
                <div key={point.text} className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <Icon name={point.icon} className="h-5 w-5 text-salon-goldlight" aria-hidden="true" />
                  <p className="mt-3 text-xs font-bold leading-5">{point.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== الباقات الديناميكية ===== */}
      <section id="pricing" className="scroll-mt-24 border-y border-salon-line bg-salon-pearl py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <SectionHeading
            eyebrow="باقات واضحة"
            title="اختر ما يناسب حجم صالونك اليوم."
            description={`ابدأ بتجربة مجانية لمدة ${trialDays} يومًا، ثم فعّل الباقة المناسبة من داخل لوحة صالونك. الأسعار والمزايا هنا هي نفسها المعتمدة في النظام.`}
          />

          {publicPlans.length > 0 ? (
            <div className="mt-10 grid items-stretch gap-5 sm:mt-14 lg:grid-cols-3">
              {publicPlans.map((plan) => {
                const annualPrice = plan.priceYearly ?? plan.priceMonthly * 10;
                const annualSaving = Math.max(0, plan.priceMonthly * 12 - annualPrice);

                return (
                  <article
                    key={plan.id}
                    className={`relative flex flex-col overflow-hidden rounded-3xl border p-6 shadow-[0_24px_65px_-45px_rgba(48,24,95,.55)] sm:p-7 ${
                      plan.isFeatured
                        ? "border-violet-500 bg-[#110a1d] text-white ring-4 ring-violet-100"
                        : "border-salon-line bg-white"
                    }`}
                  >
                    {plan.isFeatured ? (
                      <span className="absolute left-5 top-5 rounded-full bg-violet-500 px-3 py-1 text-[11px] font-bold text-white">
                        الأكثر طلبًا
                      </span>
                    ) : null}

                    <p className={`text-xs font-bold ${plan.isFeatured ? "text-salon-goldlight" : "text-violet-700"}`}>
                      باقة XMANSX
                    </p>
                    <h3 className="mt-2 text-2xl font-bold">{plan.name}</h3>
                    <p className={`mt-3 min-h-12 text-sm leading-6 ${plan.isFeatured ? "text-slate-300" : "text-slate-600"}`}>
                      {plan.description ?? "تشغيل متكامل وواضح لصالونك وفريقك."}
                    </p>

                    <div className={`mt-6 rounded-2xl p-4 ${plan.isFeatured ? "bg-white/10" : "bg-violet-50"}`}>
                      <div className="flex items-end gap-2">
                        <strong className="text-3xl font-black">{formatMoney(plan.priceMonthly)}</strong>
                        <span className={`pb-1 text-xs ${plan.isFeatured ? "text-slate-400" : "text-slate-500"}`}>/ شهريًا</span>
                      </div>
                      <p className={`mt-2 text-xs ${plan.isFeatured ? "text-violet-200" : "text-violet-700"}`}>
                        سنويًا: {formatMoney(annualPrice)}
                        {annualSaving > 0 ? ` · وفّر ${formatMoney(annualSaving)}` : ""}
                      </p>
                    </div>

                    <div className={`mt-5 grid grid-cols-2 gap-2 text-xs font-bold ${plan.isFeatured ? "text-slate-200" : "text-slate-700"}`}>
                      <span className={`rounded-xl p-3 ${plan.isFeatured ? "bg-white/5" : "bg-slate-50"}`}>
                        {plan.maxSalons} {plan.maxSalons === 1 ? "فرع" : "فروع"}
                      </span>
                      <span className={`rounded-xl p-3 ${plan.isFeatured ? "bg-white/5" : "bg-slate-50"}`}>
                        {plan.maxBarbers == null ? "حلاقون بلا حد" : `${plan.maxBarbers} حلاقين`}
                      </span>
                    </div>

                    <ul className={`mt-6 flex-1 space-y-3 text-sm ${plan.isFeatured ? "text-slate-200" : "text-slate-700"}`}>
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-500/15 text-xs font-black text-violet-500">
                            ✓
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href="/signup"
                      className={`mt-7 min-h-12 rounded-xl px-5 text-center text-sm font-bold leading-[3rem] transition-colors ${
                        plan.isFeatured
                          ? "bg-violet-500 text-white hover:bg-violet-400"
                          : "bg-salon-onyx text-white hover:bg-violet-800"
                      }`}
                    >
                      ابدأ التجربة المجانية
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-salon-line bg-white p-7 text-center text-slate-600">
              يجري تجهيز الباقات للنشر. يمكنك بدء التجربة المجانية الآن والتواصل معنا لاختيار الاشتراك المناسب.
            </div>
          )}

          <p className="mt-7 text-center text-xs text-slate-500">
            الأسعار بالريال السعودي · لا نسبة على المبيعات · يمكنك طلب الإلغاء من لوحة اشتراكك
          </p>
        </div>
      </section>

      {/* ===== الأسئلة الشائعة ===== */}
      <section id="faq" className="scroll-mt-24 border-t border-salon-line bg-white py-16 sm:py-24 lg:py-28">
        {/* الحدّ الأقصى على عنصر داخلي لا على `.x-shell`: الصنف يعرّف `max-width`
            ويُصدَر بعد أدوات Tailwind، فـ `max-w-4xl` عليه نفسه لا يُطبَّق. */}
        <div className="x-shell">
          <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="قبل أن تبدأ"
            title="الأسئلة التي تُسأل فعلًا."
            description="أجوبة مباشرة، بما فيها ما لا يفعله النظام."
          />
          <div className="mt-10 divide-y divide-salon-line rounded-3xl border border-salon-line bg-salon-pearl px-4 sm:mt-12 sm:px-8">
            {pageFaqs.map((faq) => (
              <details key={faq.question} className="group py-4 sm:py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.95rem] font-bold marker:hidden sm:gap-5 sm:text-lg">
                  <span>{faq.question}</span>
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xl font-light text-violet-700 transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="x-body max-w-3xl pb-1 pt-3.5 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
          </div>
        </div>
      </section>

      {/* ===== الدعوة الختامية ===== */}
      <section className="bg-[#0a0710] py-16 text-white sm:py-20">
        <div className="x-shell">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <BrandLogo className="h-20 w-20 rounded-3xl border border-salon-goldlight/20 shadow-[0_0_45px_rgba(124,58,237,.3)] sm:h-24 sm:w-24" />
          <p className="mt-6 text-[11px] font-bold tracking-[.24em] text-salon-goldlight" dir="ltr">
            XMANSX SOFTWARE SERVICE
          </p>
          <h2 className="x-h2 x-balance mt-4 font-bold">جرّبها على وردية واحدة.</h2>
          <p className="x-lead mt-4 max-w-2xl text-slate-400">
            افتح الصندوق صباحًا وأقفله مساءً داخل النظام. إن لم يوفّر عليك الوقت ويكشف لك رقمًا لم تكن تراه، لا شيء
            يلزمك بالاستمرار.
          </p>
          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/signup" className="x-button-primary min-h-[3.25rem] flex-1 px-6 text-[0.95rem] sm:min-h-14 sm:px-7 sm:text-base">
              ابدأ {trialDays} يومًا مجانًا
            </Link>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noreferrer"
              className="x-button-ghost min-h-[3.25rem] flex-1 px-6 text-[0.95rem] sm:min-h-14 sm:px-7 sm:text-base"
            >
              <Icon name="whatsapp" className="h-5 w-5" aria-hidden="true" />
              اسأل قبل أن تبدأ
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-500">بدون بطاقة بنكية · بدون التزام · إلغاء في أي وقت</p>
          </div>
        </div>
      </section>

      {/* ===== التذييل ===== */}
      <footer className="border-t border-white/10 bg-[#07050b] pt-10 text-slate-400">
        <div className="x-shell">
          <div className="grid gap-8 pb-8 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3">
                <BrandLogo className="h-10 w-10 rounded-xl border border-white/10" />
                <div>
                  <p className="font-bold text-white">إكس مانس إكس</p>
                  <p className="mt-0.5 text-[11px]" dir="ltr">
                    XMANSX SOFTWARE SERVICE
                  </p>
                </div>
              </div>
              <p className="x-body mt-4 max-w-xs text-slate-500">
                نظام تشغيل عربي لصالونات الحلاقة الرجالية — من فتح الصندوق إلى قرار التوسّع.
              </p>
            </div>

            <nav aria-label="روابط الدخول">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-salon-goldlight">الدخول</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/dashboard/login">
                    لوحة الإدارة
                  </Link>
                </li>
                <li>
                  <Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/barber/login">
                    تطبيق الحلاق
                  </Link>
                </li>
                <li>
                  <Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/join">
                    انضمام الزبون للولاء
                  </Link>
                </li>
                <li>
                  <Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/signup">
                    إنشاء مؤسسة جديدة
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="الروابط القانونية">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-salon-goldlight">قانوني</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/terms">الشروط والأحكام</Link></li>
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/privacy">سياسة الخصوصية</Link></li>
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/refund-policy">الإلغاء والاسترداد</Link></li>
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/data-processing-agreement">معالجة البيانات</Link></li>
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/provider">مقدم الخدمة</Link></li>
              </ul>
            </nav>

            <nav aria-label="روابط الصفحة">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-salon-goldlight">تعرّف أكثر</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="#solution">
                    لماذا XMANSX
                  </a>
                </li>
                <li>
                  <a className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="#features">
                    الإمكانات
                  </a>
                </li>
                <li>
                  <a className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="#field">
                    داخل الصالون
                  </a>
                </li>
                <li>
                  <a className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="#pricing">
                    الباقات والأسعار
                  </a>
                </li>
                <li>
                  <a className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="#faq">
                    الأسئلة الشائعة
                  </a>
                </li>
              </ul>
            </nav>

            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-salon-goldlight">تواصل</p>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold text-white transition-colors hover:border-salon-goldlight/45 hover:bg-white/5"
              >
                <Icon name="whatsapp" className="h-4 w-4" aria-hidden="true" />
                <span dir="ltr">{WHATSAPP_DISPLAY}</span>
              </a>
              <p className="x-body mt-3 text-slate-500">نؤكد استلام رسائل الدعم والشكاوى خلال يومي عمل.</p>
              <Link href="/contact" className="mt-2 inline-flex text-xs font-bold text-salon-goldlight hover:text-white">التواصل والشكاوى</Link>
            </div>
          </div>

          <div
            className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-5 text-center text-[11px] sm:flex-row sm:text-right"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <p>{legalInfo.providerName} · وثيقة عمل حر <span dir="ltr">{legalInfo.freelanceDocumentNumber}</span></p>
            <p>
              جميع الحقوق محفوظة © <span dir="ltr">XMANSX</span>
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
