import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { JsonLd } from "@/components/seo/json-ld";
import { LEGAL_VERSION, legalInfo } from "@/lib/legal";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo";

const LEGAL_LINKS = [
  { href: "/terms", label: "الشروط والأحكام" },
  { href: "/privacy", label: "سياسة الخصوصية" },
  { href: "/refund-policy", label: "الإلغاء والاسترداد" },
  { href: "/digital-service-policy", label: "تقديم الخدمة الرقمية" },
  { href: "/data-processing-agreement", label: "اتفاقية معالجة البيانات" },
  { href: "/provider", label: "مقدم الخدمة" },
  { href: "/contact", label: "التواصل والشكاوى" },
] as const;

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
  links?: Array<{ href: string; label: string; description?: string }>;
};

export function LegalPage({
  path,
  title,
  description,
  intro,
  sections,
}: {
  /**
   * مسار الصفحة من جذر الموقع.
   *
   * البيانات المنظّمة تحتاج المسار ولا تستطيع اشتقاقه: المكوّن يُصيَّر على
   * الخادم بلا وصول إلى الطلب، و`usePathname` يحوّله إلى مكوّن عميل فتُفقد
   * الصفحة تصييرها الساكن. الوسم في `LEGAL_LINKS` أدناه هو نفسه مصدر التسمية.
   */
  path: string;
  title: string;
  description: string;
  /**
   * محتوى يسبق البنود داخل نفس البطاقة.
   *
   * صفحة التواصل ليست وثيقة تُقرأ بل إجراء يُتخذ: أزرار الاتصال تسبق الشروح،
   * وبقية الصفحات القانونية تتركه فارغًا فلا يتغيّر شيء عندها.
   */
  intro?: ReactNode;
  sections: LegalSection[];
}) {
  // مسار تنقّل من مستويين يجعل النتيجة تظهر كـ «الرئيسية › سياسة الخصوصية»
  // بدل رابط خام، ويربط الوثيقة بكيان الموقع المُعلن في الصفحة الرئيسية.
  const jsonLdGraph = [
    breadcrumbJsonLd([
      { name: "الرئيسية", path: "/" },
      { name: title, path },
    ]),
    webPageJsonLd({ path, name: title, description, hasBreadcrumb: true }),
  ];

  return (
    <main className="min-h-screen bg-salon-mist text-salon-ink">
      <JsonLd graph={jsonLdGraph} />
      <header className="border-b border-white/10 bg-salon-onyx text-white">
        <div className="x-shell flex items-center justify-between gap-4 py-4">
          <Link href="/" className="flex min-h-11 items-center gap-3">
            <BrandLogo className="h-10 w-10 rounded-xl border border-white/10" />
            <span className="font-bold">إكس مانس إكس XMANSX</span>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            العودة للرئيسية
          </Link>
        </div>
      </header>

      <div className="x-shell py-10 sm:py-14">
        <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-salon-line bg-white shadow-[var(--shadow-lg)]">
          <div className="border-b border-salon-line bg-salon-pearl px-6 py-8 sm:px-10">
            <p className="text-xs font-bold text-violet-700">
              الإصدار <span dir="ltr">{LEGAL_VERSION}</span>
            </p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-8 text-salon-charcoal">{description}</p>
          </div>

          {intro ? <div className="border-b border-salon-line px-6 py-8 sm:px-10">{intro}</div> : null}

          <div className="space-y-8 px-6 py-8 sm:px-10 sm:py-10">
            {sections.map((section) => (
              <section key={section.title} className="scroll-mt-24">
                <h2 className="text-xl font-bold">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm font-semibold leading-8 text-salon-charcoal">{paragraph}</p>
                ))}
                {section.items ? (
                  <ul className="mt-3 list-disc space-y-2 pr-5 text-sm font-semibold leading-7 text-salon-charcoal">
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
                {section.links?.map((link) => (
                  <p key={link.href} className="mt-3 text-sm font-semibold leading-7 text-salon-charcoal">
                    {link.description ? `${link.description} ` : null}
                    <a
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                      className="font-bold text-violet-800 underline decoration-violet-300 underline-offset-4 hover:text-violet-950"
                    >
                      {link.label}
                    </a>
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>

        {/* مساحة لمس لا نصّ صغير: روابط بارتفاع 44px هي الحدّ الذي يُصيبه الإبهام. */}
        <nav
          aria-label="الروابط القانونية"
          className="mx-auto mt-6 flex max-w-4xl flex-wrap justify-center gap-x-2 gap-y-1 text-xs font-bold text-violet-800"
        >
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-xl px-3 transition hover:bg-white hover:text-violet-950"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="mt-5 text-center text-xs font-semibold text-salon-charcoal/70">
          {legalInfo.brandName} · يقدمها {legalInfo.providerName} بصفته {legalInfo.providerType}
        </p>
      </div>
    </main>
  );
}
