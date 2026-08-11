/**
 * مصدر الحقيقة للتاريخ التشغيلي في XMANSX.
 *
 * المملكة العربية السعودية تعمل على UTC+03:00 طوال العام بلا توقيت صيفي.
 * نستخدم حسابات UTC الصريحة هنا كي لا تعتمد المواعيد على منطقة خادم Node أو
 * جهاز العميل، مع إبقاء اسم IANA موحدًا لكل عمليات العرض عبر Intl.
 */
export const RIYADH_TIME_ZONE = "Asia/Riyadh";

const RIYADH_OFFSET_MINUTES = 3 * 60;
const RIYADH_OFFSET_MS = RIYADH_OFFSET_MINUTES * 60_000;

export type RiyadhDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

export function getRiyadhDateParts(value: Date): RiyadhDateParts {
  assertValidDate(value);
  const shifted = new Date(value.getTime() + RIYADH_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

export function startOfRiyadhDay(value: Date) {
  const parts = getRiyadhDateParts(value);
  return riyadhDateTime(parts.year, parts.month, parts.day, 0);
}

/** يحوّل تاريخ واجهة `YYYY-MM-DD` أو لحظة زمنية إلى بداية يوم الرياض. */
export function normalizeRiyadhDay(value: Date | string) {
  return typeof value === "string" ? parseRiyadhDateKey(value) : startOfRiyadhDay(value);
}

/** نطاق يوم تشغيلي كامل: البداية مشمولة والنهاية غير مشمولة. */
export function getRiyadhDayRange(value: Date | string) {
  const from = normalizeRiyadhDay(value);
  return { from, to: addRiyadhDays(from, 1) };
}

/** بداية الشهر الميلادي الذي تقع فيه اللحظة بحسب تقويم الرياض. */
export function startOfRiyadhMonth(value: Date = new Date()) {
  const { year, month } = getRiyadhDateParts(value);
  return riyadhDateTime(year, month, 1, 0);
}

/** نطاق الشهر الميلادي بحسب الرياض، مستقل عن منطقة خادم Node. */
export function getRiyadhMonthRange(value: Date = new Date()) {
  const from = startOfRiyadhMonth(value);
  return { from, to: addRiyadhMonths(from, 1) };
}

/** بداية الشهر بعد عدد من الأشهر المدنية — يتخطى اختلاف أطوال الشهور. */
export function addRiyadhMonths(value: Date, months: number) {
  const { year, month } = getRiyadhDateParts(value);
  const civil = createUtcDate(year, month, 1, 0);
  civil.setUTCMonth(civil.getUTCMonth() + months);
  return riyadhDateTime(civil.getUTCFullYear(), civil.getUTCMonth() + 1, 1, 0);
}

/**
 * مفتاح الشهر التشغيلي `YYYY-MM` بحسب تقويم الرياض.
 * هو وحدة التجميع المالي: كل تقرير شهري يُفهرس به، وهو نفسه ما تحمله الروابط.
 */
export function toRiyadhMonthKey(value: Date) {
  const { year, month } = getRiyadhDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseRiyadhMonthKey(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Invalid month key");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Invalid month key");
  return riyadhDateTime(year, month, 1, 0);
}

export function isRiyadhMonthKey(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    parseRiyadhMonthKey(value);
    return true;
  } catch {
    return false;
  }
}

/** نطاق يشمل الشهرين وما بينهما: البداية مشمولة والنهاية غير مشمولة. */
export function getRiyadhMonthSpan(fromKey: string, toKey: string) {
  const first = parseRiyadhMonthKey(fromKey);
  const last = parseRiyadhMonthKey(toKey);
  const [start, end] = first <= last ? [first, last] : [last, first];
  return { from: start, to: addRiyadhMonths(end, 1) };
}

/** قائمة مفاتيح الأشهر بين شهرين شاملةً الطرفين، مرتّبة تصاعديًا. */
export function riyadhMonthKeysBetween(fromKey: string, toKey: string) {
  const { from, to } = getRiyadhMonthSpan(fromKey, toKey);
  const keys: string[] = [];
  for (let cursor = from; cursor < to; cursor = addRiyadhMonths(cursor, 1)) {
    keys.push(toRiyadhMonthKey(cursor));
  }
  return keys;
}

/** يعيد منتصف ليل الرياض بعد عدد من الأيام المدنية من تاريخ القيمة. */
export function addRiyadhDays(value: Date, days: number) {
  const parts = getRiyadhDateParts(value);
  const civil = createUtcDate(parts.year, parts.month, parts.day, 0);
  civil.setUTCDate(civil.getUTCDate() + days);
  return riyadhDateTime(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), 0);
}

export function toRiyadhDateKey(value: Date) {
  const { year, month, day } = getRiyadhDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseRiyadhDateKey(value: string) {
  const parts = parseDateKeyParts(value);
  return riyadhDateTime(parts.year, parts.month, parts.day, 0);
}

export function parseDateKeyParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Invalid date key");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validation = createUtcDate(year, month, day, 0);
  if (
    validation.getUTCFullYear() !== year ||
    validation.getUTCMonth() + 1 !== month ||
    validation.getUTCDate() !== day
  ) {
    throw new Error("Invalid date key");
  }
  return { year, month, day };
}

export function riyadhDateTimeForDay(value: Date, minuteOfDay: number) {
  const { year, month, day } = getRiyadhDateParts(value);
  return riyadhDateTime(year, month, day, minuteOfDay);
}

export function getRiyadhWeekday(value: Date) {
  return getRiyadhDateParts(value).weekday;
}

export function getRiyadhMinuteOfDay(value: Date) {
  const parts = getRiyadhDateParts(value);
  return parts.hour * 60 + parts.minute;
}

export function isSameRiyadhDay(left: Date, right: Date) {
  return toRiyadhDateKey(left) === toRiyadhDateKey(right);
}

function riyadhDateTime(year: number, month: number, day: number, minuteOfDay: number) {
  return new Date(createUtcDate(year, month, day, minuteOfDay).getTime() - RIYADH_OFFSET_MS);
}

function createUtcDate(year: number, month: number, day: number, minuteOfDay: number) {
  // setUTCFullYear يتجنب سلوك Date.UTC الخاص بالسنوات 0..99.
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  result.setUTCHours(0, minuteOfDay, 0, 0);
  return result;
}

function assertValidDate(value: Date) {
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid Date");
}
