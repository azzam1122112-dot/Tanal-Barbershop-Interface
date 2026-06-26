import bcrypt from "bcryptjs";
import { z } from "zod";

export const adminPasswordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل");

export async function hashAdminPassword(password: string) {
  return bcrypt.hash(adminPasswordSchema.parse(password), 12);
}

export async function verifyAdminPassword(password: string, hash: string) {
  // التحقق لا يفرض قواعد التعقيد: كلمة مرور خاطئة أو قصيرة تعني عدم تطابق فقط، لا خطأ نظام.
  return bcrypt.compare(password, hash);
}
