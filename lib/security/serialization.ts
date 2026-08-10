/** تسلسل JSON آمن للاستخدام داخل عناصر script من نوع application/ld+json. */
export function serializeJsonForHtml(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
