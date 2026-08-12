import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LEGAL_VERSION, legalInfo } from "@/lib/legal";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
  links?: Array<{ href: string; label: string; description?: string }>;
};

export function LegalPage({
  title,
  description,
  intro,
  sections,
}: {
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
  return (
    <main className="min-h-screen bg-salon-mist text-salon-ink">
      <header className="border-b border-white/10 bg-salon-onyx text-white">
        <div className="x-shell flex items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo className="h-10 w-10 rounded-xl border border-white/10" />
            <span className="font-bold" dir="ltr">XMANSX</span>
          </Link>
          <Link href="/" className="text-sm font-bold text-white/70 hover:text-white">العودة للرئيسية</Link>
        </div>
      </header>

      <div className="x-shell py-10 sm:py-14">
        <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-salon-line bg-white shadow-[var(--shadow-lg)]">
          <div className="border-b border-salon-line bg-salon-pearl px-6 py-8 sm:px-10">
            <p className="text-xs font-bold text-violet-700">الإصدار {LEGAL_VERSION}</p>
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

        <nav aria-label="الروابط القانونية" className="mx-auto mt-6 flex max-w-4xl flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-bold text-violet-800">
          <Link href="/terms">الشروط والأحكام</Link>
          <Link href="/privacy">سياسة الخصوصية</Link>
          <Link href="/refund-policy">الإلغاء والاسترداد</Link>
          <Link href="/digital-service-policy">تقديم الخدمة الرقمية</Link>
          <Link href="/data-processing-agreement">اتفاقية معالجة البيانات</Link>
          <Link href="/provider">مقدم الخدمة</Link>
          <Link href="/contact">التواصل والشكاوى</Link>
        </nav>

        <p className="mt-5 text-center text-xs font-semibold text-salon-charcoal/70">
          {legalInfo.brandName} · يقدمها {legalInfo.providerName} بصفته {legalInfo.providerType}
        </p>
      </div>
    </main>
  );
}
