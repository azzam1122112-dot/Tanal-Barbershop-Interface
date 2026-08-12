import { BusinessError } from "@/lib/errors";
import { z } from "zod";

export const emailInputSchema = z.string().trim().min(3).max(254).email();
export const EMAIL_INVALID_MESSAGE = "البريد الإلكتروني غير صالح";

/**
 * الشكل المعياري للبريد في طبقة الهوية العالمية: تشذيب + تصغير حالة الأحرف.
 *
 * **ما لا تفعله عمدًا:** لا تحذف نقاط Gmail ولا لواحق `+tag`. هذه تحويلات خاصة
 * بمزوّد بعينه، وتطبيقها على الجميع يدمج بريدين **مختلفين فعلًا** عند كل مزوّد
 * لا يعاملهما كواحد — أي أن شخصًا يصل إلى حساب غيره. القاعدة القصوى المطلوبة
 * أن `Mansour@Example.com` و`mansour@example.com` حسابٌ واحد، وهي تتحقق
 * بتصغير الحالة وحده.
 *
 * (النطاق غير حسّاس لحالة الأحرف بالمواصفة، والجزء المحلي حسّاس نظريًا لكن كل
 * مزوّد عملي يعامله بلا حساسية — فتصغير الكل هو السلوك الآمن الوحيد لمفتاح تفرّد.)
 */
export function normalizeEmail(input: string) {
  const parsed = emailInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BusinessError(EMAIL_INVALID_MESSAGE);
  }
  return parsed.data.toLowerCase();
}
