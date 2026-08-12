import { getRiyadhMinuteOfDay, getRiyadhWeekday } from "@/lib/datetime/riyadh";
import { legalInfo } from "@/lib/legal";

/**
 * قنوات التواصل وحالة التوفّر — مصدر واحد للصفحة العامة.
 *
 * الصفحة كانت تطبع الرابط الخام والبريد كنصّ في قائمة نقطية، فلا يُضغط ولا
 * يُنسخ، ولا يعرف الزائر أصلًا إن كان أحد سيرد الآن. القنوات هنا **إجراءات**
 * لا سطور: `tel:` و`mailto:` و`wa.me` مع رسالة مُعبّأة بما نحتاجه فعلًا.
 */

/** ساعات العمل المعلنة: الأحد–الخميس 9ص–6م بتوقيت الرياض. */
export const SUPPORT_HOURS = {
  /** 0 = الأحد. */
  weekdays: [0, 1, 2, 3, 4],
  openMinute: 9 * 60,
  closeMinute: 18 * 60,
} as const;

const WEEKDAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type SupportAvailability = {
  open: boolean;
  label: string;
  /** متى يبدأ الرد إن كنّا خارج الدوام. */
  nextOpenLabel: string | null;
};

/**
 * حالة التوفّر مشتقّة من الساعات المعلنة لا مكتوبة يدويًا: شارة «متاح الآن»
 * تُكتب بالید تتحوّل إلى وعد كاذب أول عطلة.
 */
export function getSupportAvailability(now = new Date()): SupportAvailability {
  const weekday = getRiyadhWeekday(now);
  const minute = getRiyadhMinuteOfDay(now);
  const workday = (SUPPORT_HOURS.weekdays as readonly number[]).includes(weekday);
  const open = workday && minute >= SUPPORT_HOURS.openMinute && minute < SUPPORT_HOURS.closeMinute;

  if (open) {
    return { open: true, label: "متاح الآن", nextOpenLabel: null };
  }

  // اليوم نفسه إن كان دوامًا ولم يبدأ بعد، وإلا أقرب يوم عمل قادم.
  if (workday && minute < SUPPORT_HOURS.openMinute) {
    return { open: false, label: "خارج ساعات العمل", nextOpenLabel: "اليوم 9 صباحًا" };
  }

  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const day = (weekday + ahead) % 7;
    if ((SUPPORT_HOURS.weekdays as readonly number[]).includes(day)) {
      const name = ahead === 1 ? "غدًا" : WEEKDAY_NAMES[day];
      return { open: false, label: "خارج ساعات العمل", nextOpenLabel: `${name} 9 صباحًا` };
    }
  }

  return { open: false, label: "خارج ساعات العمل", nextOpenLabel: null };
}

/** جوال محلي `05…` → صيغة دولية صالحة لـ `tel:`. */
export function supportTelLink() {
  const digits = legalInfo.supportPhone.replace(/\D/g, "");
  const international = digits.startsWith("966") ? digits : `966${digits.replace(/^0/, "")}`;
  return `tel:+${international}`;
}

/**
 * بريد مُعبّأ بالحقول التي نطلبها أصلًا لمعالجة الشكوى.
 * رسالة ناقصة تعني دورة أسئلة كاملة قبل أن يبدأ الحل.
 */
export function supportMailtoLink(subject: string) {
  const body = [
    "اسم الصالون:",
    "اسم صاحب الحساب:",
    "رقم جوال للتواصل:",
    "وصف المشكلة وتاريخ حدوثها:",
    "رقم الفاتورة أو مرجع التحويل (للأمور المالية):",
    "",
    "— لا ترسل كلمة المرور أو رمز التحقق أو بيانات بطاقتك.",
  ].join("\n");

  return `mailto:${legalInfo.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
