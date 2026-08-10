export const LEGAL_VERSION = "2026-08-10.2";

export const legalInfo = {
  brandName: "إكس مانس إكس",
  brandNameLatin: "XMANSX",
  providerName: "منصور محمد بن حامد الغامدي",
  providerNameLatin: "MANSOUR MOHAMMED HAMED ALGHAMDI",
  providerType: "ممارس عمل حر",
  freelanceDocumentNumber: "FL-719915135",
  freelanceActivity: "برمجة وتطوير المواقع الإلكترونية",
  freelanceDocumentExpiresAt: "2027-06-26",
  freelanceVerificationUrl: "https://freelance.sa/certificate-validation",
  ecommerceVerificationNumber: process.env.PUBLIC_ECOMMERCE_VERIFICATION_NUMBER?.trim() || "",
  ecommerceVerificationUrl: process.env.PUBLIC_ECOMMERCE_VERIFICATION_URL?.trim() || "",
  supportEmail: process.env.PUBLIC_SUPPORT_EMAIL?.trim() || "support@xmansx.com",
  supportPhone: process.env.PUBLIC_SUPPORT_PHONE?.trim() || "0537720207",
  supportWhatsApp: process.env.PUBLIC_SUPPORT_WHATSAPP?.trim() || "966537720207",
  businessAddress:
    process.env.PUBLIC_BUSINESS_ADDRESS?.trim() ||
    "الرياض، المملكة العربية السعودية",
  primaryHostingLocation:
    process.env.PUBLIC_DATA_HOSTING_LOCATION?.trim() ||
    "لم يُعلن بعد — يجب نشر موقع الاستضافة الفعلي قبل إدخال بيانات حقيقية",
  privacyEmail: process.env.PUBLIC_PRIVACY_EMAIL?.trim() || "support@xmansx.com",
} as const;

export function supportWhatsAppLink(message = "السلام عليكم، أحتاج مساعدة بخصوص منصة XMANSX.") {
  return `https://wa.me/${legalInfo.supportWhatsApp}?text=${encodeURIComponent(message)}`;
}
