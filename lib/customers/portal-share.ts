export function buildCustomerPortalShareMessage({
  customerName,
  portalUrl,
}: {
  customerName: string;
  portalUrl: string;
}) {
  return [
    `مرحبًا ${customerName}،`,
    "تم تسجيلك بنجاح في برنامج الولاء.",
    "هذا رابط صفحتك الشخصية لمتابعة نقاطك ومكافآتك وحجوزاتك:",
    portalUrl,
    "احتفظ بهذا الرابط للدخول مستقبلًا، ولا تشاركه مع أي شخص.",
  ].join("\n");
}
