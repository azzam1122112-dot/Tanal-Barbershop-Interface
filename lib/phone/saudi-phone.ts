import { BusinessError } from "@/lib/errors";
import { z } from "zod";

export const saudiPhoneInputSchema = z.string().trim().min(1, "رقم الجوال مطلوب");
export const SAUDI_LOCAL_MOBILE_PATTERN = /^05\d{8}$/;
export const SAUDI_LOCAL_MOBILE_MESSAGE = "رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام";

export function normalizeSaudiPhone(input: string) {
  const raw = saudiPhoneInputSchema.parse(input);
  const digits = raw.replace(/\D/g, "");

  if (!SAUDI_LOCAL_MOBILE_PATTERN.test(digits)) {
    throw new BusinessError(SAUDI_LOCAL_MOBILE_MESSAGE);
  }

  return digits;
}

export function toSaudiWhatsAppPhone(input: string) {
  const localPhone = normalizeSaudiPhone(input);
  return `966${localPhone.slice(1)}`;
}

/** الرقم الوطني السعودي للجوال: تسع خانات تبدأ بـ 5. */
const SAUDI_NATIONAL_MOBILE_PATTERN = /^5\d{8}$/;
export const SAUDI_E164_MESSAGE = "رقم جوال سعودي غير صالح";

/**
 * الشكل المعياري لرقم الجوال في طبقة الهوية العالمية: `+9665XXXXXXXX` (E.164).
 *
 * **لماذا دالة ثانية ولا نوسّع `normalizeSaudiPhone`:** تلك تحرس نماذج قائمة
 * وتقبل `05XXXXXXXX` وحده، ورسالتها العربية جزء من عقد تلك النماذج. توسيعها
 * ليقبل صيغًا دولية يغيّر ما تقبله شاشاتٌ لم يُطلب تغييرها. الشكل هنا مختلف
 * أيضًا: `+` صريحة لأن العمود مفتاح تفرّد **عالمي** لا حقل عرض، وغياب اللاحقة
 * الدولية يجعل رقمين من بلدين يتصادمان لو دخل البلد الثاني لاحقًا.
 *
 * **ولماذا بلا `libphonenumber-js`:** الحالة بلد واحد ونمط واحد، والمكتبة تجرّ
 * بيانات كل بلدان العالم لحساب تعبير من تسع خانات. تُعاد الموازنة يوم تُفتح
 * أرقام غير سعودية، لا اليوم.
 *
 * يقبل: `0551234567` · `551234567` · `+966551234567` · `00966551234567`
 * ويعيد جميعها: `+966551234567`.
 */
export function toSaudiE164(input: string) {
  const raw = saudiPhoneInputSchema.parse(input);
  let digits = raw.replace(/\D/g, "");

  // ترتيب النزع مقصود: الأطول أولًا حتى لا يُقرأ `00966` على أنه `966`.
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);
  // صفر البداية الوطني يُنزع بعد رمز الدولة أيضًا، فـ `+9660551234567` شائعة الكتابة.
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (!SAUDI_NATIONAL_MOBILE_PATTERN.test(digits)) {
    throw new BusinessError(SAUDI_E164_MESSAGE);
  }

  return `+966${digits}`;
}
