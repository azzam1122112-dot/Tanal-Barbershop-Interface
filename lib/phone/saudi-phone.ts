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
