/**
 * تأجيل دعوة تثبيت التطبيق.
 *
 * **الإخفاء تأجيل لا إلغاء.** كانت القيمة المخزَّنة `"1"` ثابتة بلا أي زمن، فأي
 * ضغطة على «إخفاء» — أو تثبيتٌ سابق ثم إزالة للتطبيق — تُسكت الدعوة **إلى
 * الأبد** على ذلك الجهاز، ولا سبيل لإعادتها إلا بمسح تخزين المتصفح.
 *
 * القيمة الآن طابع زمني لنهاية التأجيل، و`Number("1")` القديمة تُقرأ منتهية
 * تلقائيًا: تعود الدعوة لكل من عَلِق بها بلا أي ترحيل بيانات.
 */

export const INSTALL_SNOOZE_KEY = "tanal-install-dismissed";
export const INSTALL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** هل الدعوة مؤجَّلة الآن؟ أي قيمة غير رقمية أو ماضية تعني: اعرضها. */
export function isInstallSnoozed(raw: string | null, now: number = Date.now()) {
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && until > now;
}

/** القيمة التي تُكتب عند الإخفاء. */
export function nextInstallSnooze(now: number = Date.now()) {
  return String(now + INSTALL_SNOOZE_MS);
}
