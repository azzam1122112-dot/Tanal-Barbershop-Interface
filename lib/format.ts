/**
 * تنسيق عربي بأرقام لاتينية.
 *
 * `ar-SA` وحدها تُخرج أرقامًا هندية (`٠`، `١٬٢٤٠`)، وهذا سبب عيبين رأيناهما فعلًا:
 * 1) الصفر `٠` يُرسم نقطة صغيرة، فيظهر «صافي عملياتك اليوم ·» وكأن البيانات مفقودة.
 * 2) اختلاط النظامين في الشاشة الواحدة، لأن العدّادات كانت تُطبع بـ `toString()`.
 * لاحقة `-u-nu-latn` تبقي التنسيق العربي (الفواصل والاتجاه) وتجعل الأرقام لاتينية.
 */
import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";

const LOCALE = "ar-SA-u-nu-latn";

/** رقم مالي بدون عملة، مثل لوحات الحلاق المدمجة. */
export function formatAmount(value: number) {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
}

/** مبلغ مالي مع عملة الريال. */
export function formatMoney(value: number) {
  return `${formatAmount(value)} ريال`;
}

/** عدد صحيح (نقاط، عدد زيارات...). **استخدمها بدل `.toString()`** حتى لا تختلط الأنظمة. */
export function formatNumber(value: number) {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/** نسبة مئوية جاهزة للعرض. */
export function formatPercent(value: number, fractionDigits = 0) {
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: fractionDigits })}%`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(LOCALE, { timeZone: RIYADH_TIME_ZONE });
}

export function formatTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString(LOCALE, { timeZone: RIYADH_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString(LOCALE, { timeZone: RIYADH_TIME_ZONE });
}

/**
 * صيغة الجمع العربية الصحيحة للعدّ.
 * العربية ليست كالإنجليزية: 1 مفرد، 2 مثنى، 3–10 جمع، 11+ مفرد منصوب.
 * بدونها تظهر نصوص مثل «3 عميل يستحق» بدل «3 عملاء يستحقون».
 */
export function pluralizeAr(
  count: number,
  forms: { one: string; two: string; few: string; many: string },
) {
  const absolute = Math.abs(Math.trunc(count));
  if (absolute === 1) return forms.one;
  if (absolute === 2) return forms.two;
  if (absolute >= 3 && absolute <= 10) return forms.few;
  return forms.many;
}

/** عدّ جاهز: «عميل واحد» / «عميلان» / «5 عملاء» / «14 عميلًا». */
export function countAr(
  count: number,
  forms: { one: string; two: string; few: string; many: string },
) {
  const absolute = Math.abs(Math.trunc(count));
  if (absolute === 1) return forms.one;
  if (absolute === 2) return forms.two;
  return `${formatNumber(count)} ${pluralizeAr(count, forms)}`;
}
