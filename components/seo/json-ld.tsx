import { serializeJsonForHtml } from "@/lib/security/serialization";

/**
 * وسم واحد لكل البيانات المنظّمة في الصفحة عبر `@graph`.
 *
 * **لماذا رسم بياني واحد لا وسوم متعدّدة:** العقد المنفصلة لا تعرف بعضها، فيقرأ
 * المحرك «تطبيق برمجي» و«منظمة» ككيانين لا علاقة بينهما. داخل `@graph` يشير كل
 * عقدة إلى الأخرى بـ `@id` فيُبنى كيان واحد مترابط — وهو شرط ظهور اسم الناشر
 * وشعاره بجانب النتيجة.
 *
 * التسلسل يمر بـ `serializeJsonForHtml` فيُهرَّب `<` ولا يستطيع نص قادم من قاعدة
 * البيانات (اسم باقة مثلًا) إغلاق الوسم وحقن سكربت.
 */
export function JsonLd({ graph }: { graph: readonly unknown[] }) {
  if (graph.length === 0) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonForHtml({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}
