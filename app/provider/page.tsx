import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { publicPageMetadata } from "@/lib/seo";
import { legalInfo } from "@/lib/legal";

export const metadata: Metadata = publicPageMetadata({
  path: "/provider",
  title: "مقدم الخدمة والتوثيق",
  description:
    "البيانات التعريفية لمقدم منصة إكس مانس إكس XMANSX ووثيقة العمل الحر ورقم توثيقها ووسيلة التحقق منها رسميًا.",
});

export default function ProviderPage() {
  return (
    <LegalPage
      path="/provider"
      title="مقدم الخدمة والتوثيق"
      description="البيانات التعريفية لمقدم منصة إكس مانس إكس XMANSX كما وردت في وثيقة العمل الحر المرفقة."
      sections={[
        { title: "الاسم والصفة", items: [`الاسم: ${legalInfo.providerName}.`, `الاسم بالإنجليزية: ${legalInfo.providerNameLatin}.`, `الصفة: ${legalInfo.providerType}.`, `${legalInfo.brandName} ${legalInfo.brandNameLatin} اسم المنصة ولا يمثل شركة أو مؤسسة مستقلة.`] },
        {
          title: "وثيقة العمل الحر",
          items: [`رقم الوثيقة: ${legalInfo.freelanceDocumentNumber}.`, `النشاط: ${legalInfo.freelanceActivity}.`, "الجهة المصدرة: وزارة الموارد البشرية والتنمية الاجتماعية.", "تاريخ انتهاء الوثيقة: 26 يونيو 2027."],
          links: [{ href: legalInfo.freelanceVerificationUrl, label: "التحقق عبر منصة العمل الحر الرسمية", description: `استخدم رقم الوثيقة ${legalInfo.freelanceDocumentNumber} في خدمة` }],
        },
        { title: "العنوان والتواصل", items: [`عنوان العمل: ${legalInfo.businessAddress}.`, `البريد: ${legalInfo.supportEmail}.`, `الجوال: ${legalInfo.supportPhone}.`] },
        {
          title: "توثيق التجارة الإلكترونية",
          paragraphs: [
            legalInfo.ecommerceVerificationNumber
              ? `رقم توثيق التجارة الإلكترونية: ${legalInfo.ecommerceVerificationNumber}.`
              : "لم يُعلن رقم توثيق التجارة الإلكترونية للمنصة حتى الآن.",
            "لا يعرض الموقع رقم الهوية الوطنية أو صورة وثيقة العمل الحر حمايةً لخصوصية مقدم الخدمة.",
          ],
          links: legalInfo.ecommerceVerificationUrl
            ? [{ href: legalInfo.ecommerceVerificationUrl, label: "التحقق من توثيق التجارة الإلكترونية" }]
            : undefined,
        },
      ]}
    />
  );
}
