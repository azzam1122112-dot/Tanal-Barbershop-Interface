const LOCALE = "ar-SA";

/** رقم مالي بدون عملة، مثل لوحات الحلاق المدمجة. */
export function formatAmount(value: number) {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
}

/** مبلغ مالي مع عملة الريال. */
export function formatMoney(value: number) {
  return `${formatAmount(value)} ريال`;
}

/** عدد صحيح (نقاط، عدد زيارات...). */
export function formatNumber(value: number) {
  return value.toLocaleString(LOCALE);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(LOCALE);
}

export function formatTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString(LOCALE);
}
