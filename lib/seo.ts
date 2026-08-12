import type { Metadata } from "next";
import { legalInfo } from "@/lib/legal";
import { absoluteUrl } from "@/lib/site";

/**
 * مصدر الحقيقة الوحيد لكل ما تقرأه محركات البحث: العناوين والأوصاف والروابط
 * الأساسية (canonical) وبيانات المعاينة والبيانات المنظّمة (JSON-LD).
 *
 * **لماذا مركزيًا:** الاسم التجاري كان مكتوبًا حرفيًا في تسعة ملفات، والوصف في
 * ثلاثة، وصفحة واحدة فقط كانت تحمل رابطًا أساسيًا. النتيجة: نسخ متعدّدة من
 * الصفحة نفسها تتنافس في الفهرس، وبطاقة مشاركة فارغة لكل صفحة قانونية. أي حقل
 * يُكتب هنا مرة واحدة يظهر متطابقًا في كل صفحة.
 *
 * **قاعدة الرابط الأساسي (canonical):** المنصّة تُقدَّم أيضًا على نطاقات فرعية
 * للمستأجرين (`ROOT_DOMAIN`)، فالصفحة التسويقية نفسها تُفتح من عشرات المضيفين.
 * كل رابط هنا يُبنى عبر `absoluteUrl` أي من `PUBLIC_APP_URL` لا من مضيف الطلب،
 * فيجمع الفهرس كل النسخ على نطاق واحد بدل أن يوزّع وزنها — ولذلك **لا تضع
 * `alternates.canonical` في التخطيط الجذري**: الحقول تُورَّث في Next، فصفحة بلا
 * رابط خاص بها سترث `/` وتختفي من النتائج. كل صفحة عامة تُعرّف رابطها بنفسها
 * عبر `publicPageMetadata`.
 */

export const SITE_NAME = `${legalInfo.brandName} ${legalInfo.brandNameLatin}`;

/** لغة المحتوى ومنطقته: عربي بلهجة محايدة موجّه للسوق السعودي. */
export const SITE_LANGUAGE = "ar-SA";
export const SITE_LOCALE = "ar_SA";

export const SITE_DESCRIPTION =
  "منصة عربية متكاملة لإدارة وتشغيل صالونات الحلاقة الرجالية: الزيارات والصندوق والحجوزات والعملاء والولاء والعمولات والمخزون والتقارير.";

/**
 * الكلمات المفتاحية وسم مساعد لا عامل ترتيب عند Google، لكن Bing وYandex
 * ومحرّكات عربية أصغر ما زالت تقرأه. تبقى محصورة بما تصفه الصفحة فعلًا.
 */
export const SITE_KEYWORDS = [
  "برنامج إدارة صالون حلاقة",
  "نظام صالون رجالي",
  "برنامج صالونات",
  "كاشير صالون حلاقة",
  "نقاط بيع صالون",
  "إيصالات صالون حلاقة",
  "برنامج ولاء صالون",
  "إدارة عمولات الحلاقين",
  "حجز مواعيد صالون",
  "برنامج صالون حلاقة السعودية",
  "barbershop management software",
  "barber pos arabic",
  SITE_NAME,
] as const;

/**
 * رموز ملكية الموقع لأدوات مشرفي المواقع. **بدونها لا يوجد Search Console ولا
 * Bing Webmaster**، أي لا خريطة موقع مُرسَلة ولا تقرير تغطية ولا معرفة بسبب
 * حجب صفحة. تُضبط كمتغيّرات بيئة لأن الرمز يخصّ الحساب لا الكود.
 */
export const siteVerification: NonNullable<Metadata["verification"]> = {
  google: process.env.PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || undefined,
  yandex: process.env.PUBLIC_YANDEX_SITE_VERIFICATION?.trim() || undefined,
  other: {
    // Bing يتحقّق بوسم اسمه `msvalidate.01` لا باسم قياسي في Next.
    ...(process.env.PUBLIC_BING_SITE_VERIFICATION?.trim()
      ? { "msvalidate.01": process.env.PUBLIC_BING_SITE_VERIFICATION.trim() }
      : {}),
  },
};

/**
 * `Metadata["robots"]` يقبل نصًّا خامًا أيضًا. الشكل الكائني وحده هو ما نستعمله
 * هنا، وتثبيته يجعل الحقول مقروءة للمستهلك والاختبار بدل `string | Robots`.
 */
type RobotsDirectives = Exclude<NonNullable<Metadata["robots"]>, string>;

/**
 * توجيه الفهرسة الافتراضي للصفحات العامة.
 *
 * `max-image-preview: large` هو ما يسمح لصورة المعاينة بالظهور كبيرة في نتائج
 * الجوال، و`max-snippet: -1` يرفع سقف المقتطف. بدونهما تظهر النتيجة سطرًا
 * باهتًا بلا صورة بجوار منافس يعرض بطاقة كاملة.
 */
export const INDEXABLE_ROBOTS: RobotsDirectives = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

/** الصفحات الخاصة: خلف تسجيل دخول أو خلف رمز في الرابط. لا تُفهرَس أبدًا. */
export const PRIVATE_ROBOTS: RobotsDirectives = {
  index: false,
  follow: false,
  // `noarchive` يمنع بقاء نسخة مخبّأة لدى المحرك بعد حذف الصفحة — يهمّ في
  // الإيصالات وبوابة العميل حيث الرابط نفسه يحمل بيانات شخصية.
  noarchive: true,
  nocache: true,
  googleBot: { index: false, follow: false, noarchive: true },
};

/**
 * صورة بطاقة المشاركة، مُصرَّحًا بها في كل صفحة عامة.
 *
 * **لماذا صراحةً ولا نتّكل على `app/opengraph-image.tsx`:** Next **يستبدل** كائن
 * `openGraph` كاملًا عندما يُعيد تعريفه مقطعٌ أعمق، ولا يدمجه. فور أن عرّفت صفحة
 * `‎/terms` بطاقتها الخاصة سقطت منها الصورة الموروثة من الجذر، وخرج الرابط في
 * واتساب مستطيلًا فارغًا. تأكّد من ذلك في ناتج البناء لا في التوقّع.
 *
 * المسار هو المسار المولَّد من `app/opengraph-image.tsx` نفسه — صورة واحدة
 * تُنتَج مرة ولا تتكرّر.
 */
export const SOCIAL_IMAGE = {
  url: absoluteUrl("/opengraph-image"),
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${SITE_NAME} — منصة تشغيل صالونات الحلاقة الرجالية`,
} as const;

export type PublicPageMetadataInput = {
  /** المسار المطلق من جذر الموقع، مثل `/terms`. */
  path: string;
  title: string;
  description: string;
  keywords?: readonly string[];
  /** عنوان بطاقة المشاركة إن اختلف عن عنوان الصفحة. */
  socialTitle?: string;
  socialDescription?: string;
  type?: "website" | "article";
};

/**
 * القياس الموحّد لأي صفحة عامة: رابط أساسي + hreflang + بطاقة OpenGraph
 * وTwitter + توجيه فهرسة صريح.
 *
 * **لماذا تُكتب البطاقة صراحةً لكل صفحة:** Next يرث `openGraph` من الأب، لكنه
 * لا يرث العنوان المُركَّب من القالب داخلها. صفحة قانونية بلا بطاقة خاصة تُشارَك
 * في واتساب بعنوان الصفحة الرئيسية ووصفها، فيصل الرابط ولا يدلّ على محتواه.
 */
export function publicPageMetadata({
  path,
  title,
  description,
  keywords,
  socialTitle,
  socialDescription,
  type = "website",
}: PublicPageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const ogTitle = socialTitle ?? `${title} · ${SITE_NAME}`;
  const ogDescription = socialDescription ?? description;

  return {
    title,
    description,
    ...(keywords?.length ? { keywords: [...keywords] } : {}),
    alternates: {
      canonical: path,
      // موقع بلغة واحدة لا يحتاج hreflang، لكن الإعلان الصريح عن `ar-SA`
      // مع `x-default` يمنع محرّكًا من تخمين لغة صفحة فيها أسماء لاتينية.
      languages: { [SITE_LANGUAGE]: url, "x-default": url },
    },
    robots: INDEXABLE_ROBOTS,
    openGraph: {
      type,
      locale: SITE_LOCALE,
      siteName: SITE_NAME,
      url,
      title: ogTitle,
      description: ogDescription,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [SOCIAL_IMAGE],
    },
  };
}

/* ————————————————————————————————————————————————
   البيانات المنظّمة (schema.org)

   القاعدة: لا يُعلن هنا إلا ما ينفّذه الكود فعلًا. لا `aggregateRating` ولا
   `review` ولا عدد عملاء — التقييم الملفّق يُسقط الصفحة من النتائج الغنية
   ويعرّض النطاق لعقوبة يدوية، ولا يُسترجع بسهولة.
   ———————————————————————————————————————————————— */

export const ORGANIZATION_ID = absoluteUrl("/#organization");
export const WEBSITE_ID = absoluteUrl("/#website");

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    alternateName: [legalInfo.brandName, legalInfo.brandNameLatin],
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/brand/xmansx-mark.png"),
      width: 1254,
      height: 1254,
    },
    image: SOCIAL_IMAGE.url,
    description: SITE_DESCRIPTION,
    email: legalInfo.supportEmail,
    telephone: `+${legalInfo.supportWhatsApp}`,
    founder: { "@type": "Person", name: legalInfo.providerName },
    address: {
      "@type": "PostalAddress",
      addressCountry: "SA",
      streetAddress: legalInfo.businessAddress,
    },
    areaServed: { "@type": "Country", name: "Saudi Arabia" },
    knowsLanguage: ["ar", "en"],
    // رقم وثيقة العمل الحر منشور أصلًا في صفحة مقدّم الخدمة، وإدراجه هنا يربط
    // الكيان بجهة توثيق حقيقية بدل أن يبقى اسمًا تجاريًا مجرّدًا.
    identifier: legalInfo.freelanceDocumentNumber,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: legalInfo.supportEmail,
        telephone: `+${legalInfo.supportWhatsApp}`,
        availableLanguage: ["Arabic", "ar"],
        areaServed: "SA",
        url: absoluteUrl("/contact"),
      },
    ],
  };
}

export function webSiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: absoluteUrl("/"),
    name: SITE_NAME,
    alternateName: legalInfo.brandNameLatin,
    description: SITE_DESCRIPTION,
    inLanguage: SITE_LANGUAGE,
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/**
 * مسار التنقّل. يظهر في نتيجة البحث بدل الرابط الخام، فيعرف الباحث أنه أمام
 * وثيقة قانونية داخل الموقع لا صفحة يتيمة.
 */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return {
    "@type": "BreadcrumbList",
    "@id": absoluteUrl(`${trail[trail.length - 1]?.path ?? "/"}#breadcrumb`),
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

export function webPageJsonLd({
  path,
  name,
  description,
  /**
   * يُربط مسار التنقّل بالصفحة فقط عندما تُصدِر الصفحة عقدة `BreadcrumbList`
   * فعلًا. إشارة `@id` إلى عقدة غير موجودة في نفس الرسم مرجع معلّق يرفضه مدقّق
   * النتائج الغنية ويُسقط الصفحة من الأهلية بأكملها.
   */
  hasBreadcrumb = false,
}: {
  path: string;
  name: string;
  description: string;
  hasBreadcrumb?: boolean;
}) {
  return {
    "@type": "WebPage",
    "@id": absoluteUrl(`${path}#webpage`),
    url: absoluteUrl(path),
    name,
    description,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
    ...(hasBreadcrumb ? { breadcrumb: { "@id": absoluteUrl(`${path}#breadcrumb`) } } : {}),
  };
}

export function faqPageJsonLd(faqs: ReadonlyArray<{ question: string; answer: string }>) {
  return {
    "@type": "FAQPage",
    "@id": absoluteUrl("/#faq"),
    inLanguage: SITE_LANGUAGE,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export type PublicPlanOffer = {
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
  description: string | null;
};

/**
 * بطاقة المنتج البرمجي. `offers` تحمل الأسعار المنشورة فعلًا في قاعدة البيانات،
 * فلا يظهر في النتائج سعر يخالف ما يراه الزائر على الصفحة — وهو أكثر سبب
 * لرفض النتائج الغنية.
 */
export function softwareApplicationJsonLd({
  trialDays,
  plans,
}: {
  trialDays: number;
  plans: ReadonlyArray<PublicPlanOffer>;
}) {
  return {
    "@type": "SoftwareApplication",
    "@id": absoluteUrl("/#software"),
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Salon & Barbershop Management",
    operatingSystem: "Web, iOS, Android",
    url: absoluteUrl("/"),
    image: SOCIAL_IMAGE.url,
    inLanguage: SITE_LANGUAGE,
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
    featureList: [
      "تسجيل الزيارات وإصدار إيصال بترقيم تسلسلي لكل فرع",
      "جلسة صندوق تُفتح وتُقفل بمطابقة نقدية ومصروفات نثرية",
      "احتساب عمولات الحلاقين لحظة الزيارة وحفظها بنسبتها",
      "حجز مواعيد من بوابة العميل بلا تطبيق ولا تسجيل",
      "برنامج نقاط ومكافآت يعمل بين كل الفروع",
      "إدارة الخدمات والمنتجات والمخزون مع حركة مسجّلة",
      "تقارير يومية وشهرية ومقارنة أداء الفروع",
      "صلاحيات حسب الدور والفرع وسجل تدقيق لكل عملية حسّاسة",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "التجربة المجانية",
        price: "0",
        priceCurrency: "SAR",
        availability: "https://schema.org/InStock",
        url: absoluteUrl("/signup"),
        description: `تجربة مجانية ${trialDays} يومًا بدون بطاقة بنكية`,
      },
      ...plans.flatMap((plan) => {
        const monthly = {
          "@type": "Offer",
          name: `${plan.name} · شهريًا`,
          price: String(plan.priceMonthly),
          priceCurrency: "SAR",
          availability: "https://schema.org/InStock",
          url: absoluteUrl("/#pricing"),
          description: plan.description ?? `اشتراك ${plan.name} الشهري`,
        };

        if (plan.priceYearly == null) return [monthly];

        return [
          monthly,
          {
            "@type": "Offer",
            name: `${plan.name} · سنويًا`,
            price: String(plan.priceYearly),
            priceCurrency: "SAR",
            availability: "https://schema.org/InStock",
            url: absoluteUrl("/#pricing"),
            description: plan.description ?? `اشتراك ${plan.name} السنوي`,
          },
        ];
      }),
    ],
  };
}
