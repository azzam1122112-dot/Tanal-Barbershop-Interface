import bcrypt from "bcryptjs";
import { z } from "zod";

// رمز دخول الحلاق: 8 خانات على الأقل، يقبل أي محرف مرئي (أحرف/أرقام/رموز) بدون مسافات.
// الحد الأقصى 64 خانة لتفادي القصّ الصامت في bcrypt عند تجاوز 72 بايت.
export const barberPinSchema = z
  .string()
  .min(8, "رمز الدخول يجب أن يكون 8 خانات على الأقل")
  .max(64, "رمز الدخول طويل جدًا (64 خانة كحد أقصى)")
  .refine((value) => !/\s/.test(value), {
    message: "رمز الدخول لا يجب أن يحتوي على مسافات",
  });

export function validateBarberPin(pin: string) {
  return barberPinSchema.parse(pin);
}

export async function hashBarberPin(pin: string) {
  const validPin = validateBarberPin(pin);
  return bcrypt.hash(validPin, 12);
}

export async function verifyBarberPin(pin: string, hash: string) {
  // رمز بصيغة غير صالحة لا يطابق أي حساب — نعيد false بدل رمي خطأ ليبقى الفشل 401 لا 500.
  const parsed = barberPinSchema.safeParse(pin);
  if (!parsed.success) return false;
  return bcrypt.compare(parsed.data, hash);
}
