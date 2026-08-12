import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { LandingMotion } from "@/components/marketing/landing-motion";
import landing from "@/components/marketing/landing-page.module.css";
import { Reveal } from "@/components/reveal";
import { JsonLd } from "@/components/seo/json-ld";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/format";
import { getDefaultSignupPlan, listPublicPlans } from "@/lib/plans/subscription-service";
import {
  SITE_KEYWORDS,
  SITE_NAME,
  faqPageJsonLd,
  organizationJsonLd,
  publicPageMetadata,
  softwareApplicationJsonLd,
  webPageJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";
import { legalInfo, supportWhatsAppLink } from "@/lib/legal";

const WHATSAPP_DISPLAY = legalInfo.supportPhone;
const WHATSAPP_LINK = supportWhatsAppLink("السلام عليكم، أرغب بالاستفسار عن منصة إكس مانس إكس XMANSX لإدارة صالونات الحلاقة.");

const DEFAULT_TRIAL_DAYS = 14;

export const metadata: Metadata = publicPageMetadata({
  path: "/",
  title: "منصة تشغيل صالونات الحلاقة الرجالية",
  description:
    "منصة عربية لتشغيل صالونات الحلاقة: صندوق وعمولات وإيصالات زيارة تشغيلية وحجوزات وولاء ومخزون وتقارير للفروع. تجربة مجانية بدون بطاقة بنكية.",
  keywords: SITE_KEYWORDS,
  socialTitle: `${SITE_NAME} · منصة تشغيل صالونات الحلاقة الرجالية`,
  socialDescription:
    "صندوق مضبوط، عمولات دقيقة، إيصالات زيارة واضحة، وولاء وحجوزات وتقارير. تجربة مجانية بدون بطاقة بنكية.",
});

// الصفحة عامة وثقيلة بصريًا لكن بياناتها بطيئة التغيّر. ISR يمنع استعلام
// PostgreSQL مع كل زيارة، وتُبطَل النسخة فور تعديل الباقات من لوحة المنصة.
export const revalidate = 300;

/* ————————————————————————————————————————————————
   المحتوى
   كل ادعاء هنا مقابله سلوك حقيقي في الكود. لا تُضِف بندًا لا تستطيع أن تفتح
   الملف الذي ينفّذه — الصفحة التي تعِد بما لا يوجد تُكلّف ثقة لا تُسترد.
   ———————————————————————————————————————————————— */

const trustBar: { value: string; label: string; ltr?: boolean }[] = [
  { value: "تجربة مجانية", label: "تبدأ فور التسجيل بدون بطاقة بنكية" },
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
    after: "فروع تحت حساب نشاط واحد بأرقام قابلة للمقارنة من شاشة واحدة",
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
    description: "الحلاق يسجّل حضوره، يفتح الصندوق، يستقبل الحجز، يسجّل الخدمة والمبلغ، ويصدر إيصال الزيارة.",
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
    answer: "تبدأ بتجربة الباقة المعلنة بدون بطاقة بنكية ولا التزام مالي، ومدتها هي الظاهرة وقت التسجيل. بعدها تختار من الباقات المنشورة حسب حدود الفروع والحلاقين والعملاء. لا نأخذ نسبة من مبيعاتك أو حجوزاتك — الاشتراك هو المقابل الوحيد.",
  },
  {
    question: "كم يستغرق تشغيلها في صالوني؟",
    answer:
      "تُنشئ حساب نشاطك وفرعك من صفحة البدء مباشرة. الوقت الفعلي يذهب إلى إدخال خدماتك وأسعارك وحلاقيك ونِسَب عمولاتهم، وهي خطوة تُدخَل مرة واحدة. واجهة الحلاق شاشة واحدة بخطوات متتابعة.",
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
      "نعم. تعمل الفروع تحت حساب نشاط واحد، فيجمع الزبون نقاطه من أي فرع ويستبدلها في أي فرع، بينما تقارن أنت أداء الفروع من شاشة واحدة. ويمكنك تقييد كل مدير بالفروع المسندة إليه.",
  },
  {
    question: "كيف يعمل واتساب داخل المنصة؟",
    answer:
      "تختار الشريحة — منقطعون، أصحاب مكافآت جاهزة، جمهور حملة — فتُجهّز المنصة نص الرسالة ورابط المحادثة، ثم ترسلها بيدك. لا إرسال جماعي تلقائي: هو ما يُعرّض رقم الصالون للحظر ويُزعج الزبون.",
  },
  {
    question: "ماذا يحدث لبياناتي إذا انتهى الاشتراك؟",
    answer:
      "انتهاء الاشتراك يوقف العمليات الجديدة ويبدأ مهلة عدم نشاط مدتها 60 يومًا. يستطيع المالك خلالها الدخول للقراءة والتصدير أو التجديد. بعد المهلة تُحذف بيانات الحساب من قاعدة البيانات التشغيلية، وقد تبقى نسخة معزولة ضمن النسخ الاحتياطية لمدة لا تتجاوز 30 يومًا إضافية قبل زوالها تلقائيًا.",
  },
  {
    question: "ما الفرق بين إيصال الزيارة وفاتورة الاشتراك؟",
    answer:
      "إيصال الزيارة مرجع تشغيلي يصدره الصالون لعملية مسجلة داخل حسابه. أما فاتورة اشتراك إكس مانس إكس XMANSX فتظهر للمالك بعد اعتماد دفع الباقة، وتوثّق قيمة الاشتراك وفترته وحالة السداد.",
  },
  {
    question: "كيف أوقف الاشتراك؟",
    answer:
      "لا يوجد خصم بنكي أو تجديد مالي تلقائي. يمكنك إيقاف استمرار الاشتراك من لوحة الحساب، وتبقى الخدمة متاحة حتى نهاية المدة المدفوعة. تخضع طلبات الاسترداد للسياسة المنشورة والحقوق النظامية الواجبة التطبيق.",
  },
];

const securityPoints: { icon: IconName; text: string }[] = [
  { icon: "staff", text: "صلاحيات حسب الدور والفرع" },
  { icon: "reports", text: "سجل تدقيق لكل عملية حسّاسة" },
  { icon: "billing", text: "مطابقة مالية قابلة للمراجعة" },
  { icon: "settings", text: "عزل كامل بين حسابات الأنشطة" },
];

const preContractFacts: { icon: IconName; title: string; description: string; href: string; linkLabel: string }[] = [
  {
    icon: "services",
    title: "خدمة رقمية بلا شحن",
    description: "تصل إلى المنصة عبر المتصفح أو كتطبيق ويب. لا توجد أجهزة أو منتجات مادية أو رسوم توصيل.",
    href: "/digital-service-policy",
    linkLabel: "سياسة تقديم الخدمة",
  },
  {
    icon: "billing",
    title: "دفع واضح بلا تجديد مالي تلقائي",
    description: "تُعتمد الباقة المدفوعة بعد التحقق من التحويل، ثم تظهر فاتورة الاشتراك داخل حساب المالك.",
    href: "/terms",
    linkLabel: "شروط الاشتراك",
  },
  {
    icon: "adjustments",
    title: "إيقاف الاستمرار من حسابك",
    description: "يمكنك إيقاف استمرار الاشتراك، وتبقى الخدمة حتى نهاية الفترة المدفوعة. الاسترداد وفق السياسة المنشورة.",
    href: "/refund-policy",
    linkLabel: "الإلغاء والاسترداد",
  },
  {
    icon: "staff",
    title: "بيانات زبائنك تحت تحكمك",
    description: "الصالون جهة التحكم وإكس مانس إكس XMANSX جهة معالجة. تتاح لك نسخة شاملة قبل الحذف بعد مهلة عدم النشاط.",
    href: "/data-processing-agreement",
    linkLabel: "اتفاقية معالجة البيانات",
  },
];

/* ———————————————————————————————————————————————— */

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  dark = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "center" | "start";
  dark?: boolean;
}) {
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="x-eyebrow">{eyebrow}</p>
      <h2 className={`x-h2 x-balance mt-4 font-bold ${centered ? "" : ""}`}>{title}</h2>
      <p className={`x-lead mt-5 max-w-2xl ${dark ? "text-slate-400" : "text-slate-600"} ${centered ? "mx-auto" : ""}`}>{description}</p>
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
          answer: `تبدأ بـ ${trialDays} يومًا من تجربة الباقة المعلنة بدون بطاقة بنكية ولا التزام مالي. بعدها تختار من الباقات والأسعار المنشورة حسب حدود الفروع والحلاقين والعملاء. لا نأخذ نسبة من مبيعاتك أو حجوزاتك — الاشتراك هو المقابل الوحيد.`,
        }
      : faq,
  );
  /**
   * الهوية المؤسسية والموقع يُعلنان من الرئيسية وحدها: هي الصفحة التي يقرأ منها
   * Google كيان النطاق كاملًا (الاسم والشعار وقنوات التواصل)، وتكرارها في كل
   * صفحة يزيد وزن الصفحة بلا مقابل.
   *
   * الأسعار والأسئلة تُبنى من البيانات المعروضة نفسها — لا نص ثابت يتباعد عن
   * الشاشة بعد أول تعديل باقة من لوحة المنصّة.
   */
  const jsonLdGraph = [
    organizationJsonLd(),
    webSiteJsonLd(),
    webPageJsonLd({
      path: "/",
      name: `${SITE_NAME} · منصة تشغيل صالونات الحلاقة الرجالية`,
      description:
        "منصة عربية لتشغيل صالونات الحلاقة: صندوق وعمولات وإيصالات زيارة وحجوزات وولاء ومخزون وتقارير للفروع.",
    }),
    softwareApplicationJsonLd({ trialDays, plans: publicPlans }),
    faqPageJsonLd(pageFaqs),
  ];

  return (
    <LandingMotion>
      <JsonLd graph={jsonLdGraph} />

      {/* ===== الترويسة ===== */}
      <header className={`${landing.header} sticky top-0 z-50 border-b border-white/10 text-white shadow-[0_10px_40px_rgba(9,7,15,.16)]`}>
        <div className="x-shell flex items-center justify-between gap-3 py-2.5 sm:gap-4 sm:py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="العودة إلى الصفحة الرئيسية">
            <BrandLogo
              className="h-10 w-10 rounded-xl border border-salon-goldlight/20 shadow-[0_0_22px_rgba(139,92,246,.2)] sm:h-11 sm:w-11"
              priority
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold sm:text-base">إكس مانس إكس XMANSX</p>
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
              لماذا إكس مانس إكس XMANSX
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
            <a className="transition-colors hover:text-white" href="#before-subscription">
              قبل الاشتراك
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
      <section className={`${landing.hero} relative isolate overflow-hidden text-white`}>
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
            <Reveal as="p" className={landing.heroKicker}>
              تشغيل الصالون، لكن بمشهد أوضح
            </Reveal>

            <Reveal as="h1" delay={70} className={`${landing.heroTitle} mt-7 font-bold`}>
              كل كرسي يتحرّك.
              <br />
              <span className={landing.heroTitleAccent}>ولا رقم يضيع.</span>
            </Reveal>

            <Reveal as="p" delay={140} className={`${landing.heroCopy} mt-7`}>
              منصة تشغيل عربية تربط الزيارة بالصندوق والعمولة والمخزون والولاء لحظةً بلحظة؛ لتعرف ماذا حدث، ومن نفّذه، وما الذي يحتاج قرارك الآن.
            </Reveal>

            <Reveal delay={210} className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Link href="/signup" className="x-button-primary min-h-[3.25rem] px-6 text-[0.95rem] sm:min-h-14 sm:px-7 sm:text-base">
                شغّل تجربتك {trialDays} يومًا <span aria-hidden="true">←</span>
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
            <Reveal as="p" delay={330} className="mt-4 max-w-xl text-xs font-semibold leading-6 text-slate-500">
              التسجيل يفعّل التجربة بعد قبول الشروط وسياسة الخصوصية واتفاقية معالجة البيانات. لا يوجد خصم بنكي تلقائي.
            </Reveal>
          </div>

          {/* لقطة توضيحية للوحة — معلَّمة كعرض توضيحي، وأرقامها ليست بيانات عميل. */}
          <Reveal delay={150} className={`${landing.heroFrame} relative mx-auto w-full max-w-[36rem] lg:max-w-none`}>
            <div className="absolute inset-10 rounded-full bg-violet-500/20 blur-[70px]" aria-hidden="true" />
            <div className={landing.dashboard}>
              <div className={landing.dashboardGlow} aria-hidden="true" />
              <div className="relative h-full p-4 sm:p-6">
                <div className={landing.dashboardTop}>
                  <div className="flex min-w-0 items-center gap-3">
                    <BrandLogo className="h-11 w-11 shrink-0 rounded-2xl border border-salon-goldlight/20 sm:h-14 sm:w-14" priority />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white sm:text-base">إغلاق وردية المساء</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400 sm:text-xs">فرع الملز · اليوم</p>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                    <span className={landing.liveDot} /> مباشر
                  </span>
                </div>

                <div className={landing.metricRail}>
                  {[
                    { label: "مبيعات اليوم", value: "5,630", icon: "cash" as IconName },
                    { label: "زيارات مكتملة", value: "38", icon: "visits" as IconName },
                    { label: "فرق الصندوق", value: "0", icon: "check" as IconName },
                  ].map((metric) => (
                    <div key={metric.label} className={landing.metric}>
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

                <div className={landing.chart}>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-400 sm:text-xs">إيراد الأسبوع</p>
                      <p className="mt-1 truncate text-sm font-bold">اتجاه صاعد بلا فروقات</p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-salon-goldlight sm:text-xs">7 أيام</span>
                  </div>
                  <div className={landing.bars} aria-hidden="true">
                    {[38, 52, 44, 66, 58, 74, 92, 78, 88].map((height, index) => (
                      <span
                        key={index}
                        className={landing.bar}
                        style={{ height: `${height}%`, animationDelay: `${index * 80 + 420}ms` }}
                      />
                    ))}
                  </div>
                </div>
                <div className={landing.eventCard}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-white">تم إغلاق وردية المساء</span>
                    <Icon name="check" className="h-4 w-4 text-emerald-300" />
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-slate-400">الكاش والشبكة مطابقان · المستحقات حُسبت · السجل محفوظ</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== شريط الثقة ===== */}
      <section className={`${landing.trustTicker} relative z-10 -mt-px`} aria-label="مزايا التجربة">
        <div className={landing.trustTrack}>
          {[...pageTrustBar, ...pageTrustBar].map((item, index) => (
            <div key={`${item.label}-${index}`} className={landing.trustItem} aria-hidden={index >= pageTrustBar.length}>
              <strong className="text-lg font-black text-violet-300" dir={item.ltr ? "ltr" : undefined}>{item.value}</strong>
              <span className="text-xs font-semibold text-slate-400">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== الوجع مقابل الحل ===== */}
      <section id="solution" className="scroll-mt-24 py-16 sm:py-24 lg:py-28">
        <div className="x-shell grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:gap-20">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <span className={landing.sectionNumber} dir="ltr">01</span>
            <SectionHeading
              align="start"
              eyebrow="من الفوضى إلى الانضباط"
              title="المشكلة ليست في البيع. بل فيما لا تراه بعده."
              description="نلتقط الفجوات التي تظهر آخر الوردية، ونحوّلها إلى سجل واضح وإجراء يمكن تتبعه."
            />
          </div>

          <div className={landing.storyList}>
            {painPairs.map((pair, index) => (
              <Reveal key={pair.before} delay={(index % 3) * 55} className={landing.storyItem}>
                <span className={landing.storyIndex} dir="ltr">0{index + 1}</span>
                <p className="text-sm font-semibold leading-7 text-slate-500 line-through decoration-red-300/70">{pair.before}</p>
                <span className={landing.storyArrow} aria-hidden="true">←</span>
                <p className="text-base font-bold leading-8 text-salon-ink">{pair.after}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الإمكانات ===== */}
      <section id="features" className={`${landing.systemStage} scroll-mt-24 py-16 sm:py-24 lg:py-28`}>
        <div className="x-shell relative z-10">
          <div className="grid gap-8 lg:grid-cols-[.65fr_1.35fr] lg:items-end">
            <span className={`${landing.sectionNumber} !text-white/10`} dir="ltr">02</span>
            <SectionHeading
              align="start"
              dark
              eyebrow="منظومة واحدة"
              title="عملية واحدة. أثرها يصل لكل مكان."
              description="الزيارة تحرّك المخزون والنقاط والعمولة والإيصال والصندوق في اللحظة نفسها — بلا نسخ بيانات بين أنظمة متفرقة."
            />
          </div>
          <div className={`${landing.featureRows} mt-12 sm:mt-16`}>
            {platformFeatures.map((feature, index) => (
              <Reveal
                key={feature.title}
                delay={(index % 4) * 45}
                className={landing.featureRow}
              >
                <span className={landing.featureIcon}>
                  <Icon name={feature.icon} className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-bold sm:text-xl">{feature.title}</h3>
                <p className="x-body text-slate-400">{feature.description}</p>
                <span className="text-[10px] font-bold text-violet-300">{feature.tag}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== داخل الصالون ===== */}
      <section id="field" className="scroll-mt-24 py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start lg:gap-20">
            <div>
              <span className={landing.sectionNumber} dir="ltr">03</span>
              <SectionHeading
                align="start"
                eyebrow="مصمَّم لواقع الكرسي"
                title="الواجهة تخدم الوردية، لا تستعرض نفسها."
                description="قرارات صغيرة تجعل النظام سريعًا عند الزحام وآمنًا عند تغيّر الورديات."
              />
            </div>
            <div className="border-t border-salon-line">
              {fieldReality.map((item, index) => (
                <Reveal
                  key={item.title}
                  delay={index * 55}
                  className="grid gap-4 border-b border-salon-line py-6 sm:grid-cols-[3.5rem_1fr] sm:gap-6 sm:py-8"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-violet-200 text-violet-700">
                    <Icon name={item.icon} className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="x-h3 font-bold">{item.title}</h3>
                    <p className="x-body mt-2.5 text-slate-600">{item.description}</p>
                  </div>
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
                تُحفظ الخدمة والخصم وطريقة الدفع في مسار واحد، فيرجع المالك أو الزبون إلى مرجع تشغيلي واضح.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "رقم إيصال تسلسلي لكل فرع ولكل سنة يصدر داخل معاملة الزيارة.",
                  "تفصيل الخدمات والمنتجات والخصم وطريقة الدفع والمبلغ النهائي.",
                  "إمكانية الطباعة أو الحفظ PDF من المتصفح وإرسال المرجع للزبون.",
                  "يعرض الإيصال تفاصيل العملية كما سُجّلت داخل الصالون.",
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
                  إيصال زيارة قابل للطباعة
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== رحلة التشغيل ===== */}
      <section id="journey" className="relative scroll-mt-24 overflow-hidden bg-[#f7f5fb] py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <div className="grid gap-6 lg:grid-cols-[.55fr_1.45fr] lg:items-end">
            <span className={landing.sectionNumber} dir="ltr">04</span>
            <SectionHeading
              align="start"
              eyebrow="يوم عمل كامل"
              title="من أول كرسي إلى آخر قرار."
              description="أربع محطات تتبع ما يحدث فعلًا في الصالون، وتحوّل الحركة اليومية إلى معرفة قابلة للتصرف."
            />
          </div>
          <div className={`${landing.workflow} mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-10`}>
            {journey.map((step, index) => (
              <Reveal key={step.number} delay={index * 70} className={`${landing.workflowStep} text-center md:text-right lg:text-center`}>
                <span className={landing.workflowMarker}>
                  <Icon name={step.icon} className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-violet-600" dir="ltr">{step.number}</span>
                <h3 className="mt-3 text-xl font-bold">{step.title}</h3>
                <p className="x-body mt-3 text-slate-600">{step.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الأدوار ===== */}
      <section className="py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <div className="grid gap-6 lg:grid-cols-[.55fr_1.45fr] lg:items-end">
            <span className={landing.sectionNumber} dir="ltr">05</span>
            <SectionHeading
              align="start"
              eyebrow="لكل دور واجهته"
              title="نفس الحقيقة. بالقدر المناسب لكل شخص."
              description="الحلاق يرى ما يسرّع عمله، المدير ما يحتاج متابعته، والمالك الصورة الكاملة — دون كشف صلاحيات لا تخص الدور."
            />
          </div>
          <div className={`${landing.roleStrip} mt-12 sm:mt-16`}>
            {audiences.map((audience, index) => (
              <Reveal
                key={audience.label}
                delay={index * 65}
                className={landing.role}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-violet-200 text-violet-700">
                  <Icon name={audience.icon} className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </span>
                <p className="mt-12 text-xs font-bold text-violet-600">{audience.label}</p>
                <h3 className="mt-3 text-2xl font-bold leading-snug">{audience.title}</h3>
                <p className="x-body mt-4 text-slate-600 transition-colors">{audience.description}</p>
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
              <p className="text-[11px] font-bold text-salon-goldlight">إكس مانس إكس XMANSX · SOFTWARE SERVICE</p>
              <h2 className="x-h2 x-balance mt-4 font-bold">من يرى الأرقام، ومن يستطيع تغييرها.</h2>
              <p className="x-lead mt-4 text-violet-100/85">
                صلاحيات حسب الدور والفرع، وسجل تدقيق يحفظ من نفّذ كل عملية حسّاسة ومتى وما القيمة قبلها وبعدها. أنت تعرف
                دائمًا من فعل ماذا.
              </p>
            </div>
            <div className="relative mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/15 lg:mt-0 lg:min-w-[21rem]">
              {securityPoints.map((point) => (
                <div key={point.text} className="bg-[#211236]/80 p-4">
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
            <div className={`${landing.pricingGrid} mt-10 sm:mt-14`}>
              {publicPlans.map((plan) => {
                const annualPrice = plan.priceYearly;
                const annualSaving = annualPrice == null ? 0 : Math.max(0, plan.priceMonthly * 12 - annualPrice);

                return (
                  <article
                    key={plan.id}
                    className={`${landing.priceCard} ${plan.isFeatured ? landing.priceFeatured : ""}`}
                  >
                    {plan.isFeatured ? (
                      <span className="absolute left-5 top-5 rounded-full bg-violet-500 px-3 py-1 text-[11px] font-bold text-white shadow-lg">
                        موصى بها
                      </span>
                    ) : null}

                    <p className={`text-xs font-bold ${plan.isFeatured ? "text-salon-goldlight" : "text-violet-700"}`}>
                      باقة إكس مانس إكس XMANSX
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
                      {annualPrice == null ? (
                        <p className={`mt-2 text-xs ${plan.isFeatured ? "text-violet-200" : "text-violet-700"}`}>الدفع الشهري متاح</p>
                      ) : (
                        <p className={`mt-2 text-xs ${plan.isFeatured ? "text-violet-200" : "text-violet-700"}`}>
                          سنويًا: {formatMoney(annualPrice)}
                          {annualSaving > 0 ? ` · وفّر ${formatMoney(annualSaving)}` : ""}
                        </p>
                      )}
                    </div>

                    <div className={`mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border text-xs font-bold ${plan.isFeatured ? "border-white/10 bg-white/10 text-slate-200" : "border-salon-line bg-salon-line text-slate-700"}`}>
                      <span className={`rounded-xl p-3 ${plan.isFeatured ? "bg-white/5" : "bg-slate-50"}`}>
                        {plan.maxSalons} {plan.maxSalons === 1 ? "فرع" : "فروع"}
                      </span>
                      <span className={`rounded-xl p-3 ${plan.isFeatured ? "bg-white/5" : "bg-slate-50"}`}>
                        {plan.maxBarbers == null ? "حلاقون بلا حد" : `${plan.maxBarbers} حلاقين`}
                      </span>
                      <span className={`rounded-xl p-3 ${plan.isFeatured ? "bg-white/5" : "bg-slate-50"}`}>
                        {plan.maxCustomers == null ? "عملاء بلا حد" : `${plan.maxCustomers} عميل`}
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
            الأسعار بالريال السعودي · لا نسبة على المبيعات · أوقف استمرار الاشتراك من لوحة حسابك متى شئت
          </p>
        </div>
      </section>

      {/* ===== الإفصاح قبل الاشتراك ===== */}
      <section id="before-subscription" className="scroll-mt-24 bg-white py-16 sm:py-24 lg:py-28">
        <div className="x-shell">
          <SectionHeading
            eyebrow="قبل أن تنشئ حسابك"
            title="العقد والخدمة والبيانات — بلغة مباشرة."
            description="هذه المعلومات جزء من قرار الاشتراك: ماذا تشتري، وكيف تُفعّل الخدمة، وكيف توقفها، وما الذي يحدث لبيانات نشاطك."
          />

          <div className={`${landing.legalRail} mt-10 sm:mt-14`}>
            {preContractFacts.map((fact, index) => (
              <Reveal key={fact.title} delay={index * 55} className={`${landing.legalItem} flex h-full flex-col`}>
                <span className="grid h-11 w-11 place-items-center rounded-full border border-violet-200 text-violet-700">
                  <Icon name={fact.icon} className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-bold">{fact.title}</h3>
                <p className="x-body mt-3 flex-1 text-slate-600">{fact.description}</p>
                <Link href={fact.href} className="mt-5 inline-flex min-h-10 items-center text-sm font-bold text-violet-800 hover:text-violet-950">
                  {fact.linkLabel} <span className="mr-1" aria-hidden="true">←</span>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 overflow-hidden rounded-[2rem] border border-violet-200 bg-gradient-to-l from-violet-50 via-white to-salon-pearl">
            <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:p-10">
              <div>
                <p className="text-xs font-bold text-violet-700">مقدم الخدمة</p>
                <h3 className="mt-2 text-2xl font-bold">إكس مانس إكس XMANSX يقدمها ممارس عمل حر موثّق.</h3>
                <p className="x-body mt-3 max-w-2xl text-slate-600">
                  مقدم الخدمة {legalInfo.providerName}، بموجب وثيقة عمل حر رقم <span dir="ltr">{legalInfo.freelanceDocumentNumber}</span>
                  {" "}في نشاط {legalInfo.freelanceActivity}. إكس مانس إكس XMANSX اسم المنصة وليس شركة أو مؤسسة مستقلة.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/provider" className="x-button-primary min-h-11 px-5 text-sm">بيانات مقدم الخدمة</Link>
                  <Link href="/contact" className="inline-flex min-h-11 items-center rounded-xl border border-violet-200 bg-white px-5 text-sm font-bold text-violet-900 hover:border-violet-400">التواصل والشكاوى</Link>
                </div>
              </div>
              <dl className="grid gap-3 rounded-2xl border border-white bg-white/85 p-5 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">العنوان</dt><dd className="font-bold">{legalInfo.businessAddress}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">البريد</dt><dd><a dir="ltr" className="font-bold text-violet-800 hover:underline" href={`mailto:${legalInfo.supportEmail}`}>{legalInfo.supportEmail}</a></dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">الجوال</dt><dd><a dir="ltr" className="font-bold text-violet-800 hover:underline" href={`tel:${legalInfo.supportPhone}`}>{legalInfo.supportPhone}</a></dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-slate-500">استلام الشكاوى</dt><dd className="font-bold">خلال يومي عمل</dd></div>
              </dl>
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-4xl text-center text-xs font-semibold leading-6 text-slate-500">
            بإنشاء الحساب تقبل النسخة المعروضة من شروط الاشتراك وسياسة الخصوصية وسياسة الإلغاء والاسترداد وسياسة تقديم الخدمة الرقمية واتفاقية معالجة البيانات.
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
      <section className={`${landing.cta} py-20 text-white sm:py-28`}>
        <div className={landing.ctaRing} aria-hidden="true" />
        <div className="x-shell relative">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <BrandLogo className="h-20 w-20 rounded-3xl border border-salon-goldlight/20 shadow-[0_0_45px_rgba(124,58,237,.3)] sm:h-24 sm:w-24" />
          <p className="mt-6 text-[11px] font-bold text-salon-goldlight">إكس مانس إكس XMANSX · SOFTWARE SERVICE</p>
          <h2 className="x-h2 x-balance mt-4 font-bold">وردية واحدة تكشف الفرق.</h2>
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
          <p className="mt-4 text-xs text-slate-500">بدون بطاقة بنكية · لا تجديد مالي تلقائي · أوقف الاستمرار من حسابك</p>
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
                  <p className="font-bold text-white">إكس مانس إكس XMANSX</p>
                  <p className="mt-0.5 text-[11px]" dir="ltr">SOFTWARE SERVICE</p>
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
                  <Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/signup">
                    إنشاء حساب نشاط
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
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/digital-service-policy">تقديم الخدمة الرقمية</Link></li>
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/data-processing-agreement">معالجة البيانات</Link></li>
                <li><Link className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="/provider">مقدم الخدمة</Link></li>
              </ul>
            </nav>

            <nav aria-label="روابط الصفحة">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-salon-goldlight">تعرّف أكثر</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <a className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="#solution">
                    لماذا إكس مانس إكس XMANSX
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
                  <a className="inline-flex min-h-8 items-center transition-colors hover:text-white" href="#before-subscription">
                    قبل الاشتراك
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
              جميع الحقوق محفوظة © <span>إكس مانس إكس XMANSX</span>
            </p>
          </div>
        </div>
      </footer>
    </LandingMotion>
  );
}
