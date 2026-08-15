import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getPortalIdentity } from "@/lib/customers/portal-view";
import { PortalTabs } from "@/components/public/portal-tabs";

/**
 * كل مسار داخل `middleware.ts` يُصيَّر عند الطلب.
 *
 * السياسة هناك تحمل `nonce` جديدًا لكل طلب، وصفحةٌ مبنية وقت `next build` تحمل
 * سكربتات Next بلا توقيع فيحجبها المتصفح وتُشلّ الصفحة. التوجيه في **التخطيط**
 * لا في الصفحات: مكوّنات العميل لا تُحترم فيها إعدادات المقطع، وصفحةٌ جديدة
 * تُضاف لاحقًا ترث الحكم بلا أن يتذكّره أحد. ولا كلفة — هذه المسارات تُقدَّم
 * أصلًا بـ`Cache-Control: private, no-store`.
 *
 * يحرسه `tests/security-regressions.test.ts`.
 */
export const dynamic = "force-dynamic";

/**
 * هيكل بوابة العميل — تخطيط لا مكوّن صفحة.
 *
 * الرمز يُحلّ هنا مرة واحدة، وكل تبويب صفحة خادم مستقلة تجلب ما تعرضه وحده.
 * التخطيط المشترك لا يُعاد بناؤه عند التنقّل بين التبويبات، فالترويسة تبقى
 * ثابتة ولا تُعاد قراءة العميل مع كل قفزة — نفس مبدأ هيكل اللوحة.
 *
 * البيان يُحقن عبر `metadata` لا كوسم `<link>` في الجسم: الوسم اليدوي **يُضاف**
 * إلى بيان الجذر فيصير في الصفحة بيانان، والمتصفح يأخذ الأول — فيُثبَّت الموقع
 * كاملًا بدل بطاقة العميل. `metadata.manifest` يستبدل بيان الجذر لهذا المسار.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "بطاقتي",
    // الرابط سرّي — لا نريده في نتائج البحث.
    robots: { index: false, follow: false },
    manifest: `/my/${token}/pwa.webmanifest`,
  };
}

export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // بوابة واحدة للرمز: تبويب لا يجد صاحبه لا يُرسم أصلًا.
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  return (
    <div className="min-h-screen overflow-x-hidden bg-salon-mist">
      {/* حشوة سفلية تتجاوز شريط التبويب ومنطقة الأمان معًا. */}
      <main className="mx-auto min-w-0 max-w-3xl px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="lux-eyebrow text-salon-charcoal/55">{identity.brandName}</p>
            <h1 className="mt-0.5 truncate text-xl font-bold text-salon-ink">
              أهلًا {identity.customer.name}
            </h1>
          </div>
        </header>

        {children}
      </main>

      <PortalTabs token={token} />
    </div>
  );
}
