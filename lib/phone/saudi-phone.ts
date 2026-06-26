import { BusinessError } from "@/lib/errors";
import { z } from "zod";

export const saudiPhoneInputSchema = z.string().trim().min(1, "رقم الجوال مطلوب");

export function normalizeSaudiPhone(input: string) {
  const raw = saudiPhoneInputSchema.parse(input);
  const digits = raw.replace(/[\s()-]/g, "").replace(/^\+/, "");

  let normalized: string;
  if (/^05\d{8}$/.test(digits)) {
    normalized = `966${digits.slice(1)}`;
  } else if (/^5\d{8}$/.test(digits)) {
    normalized = `966${digits}`;
  } else if (/^9665\d{8}$/.test(digits)) {
    normalized = digits;
  } else {
    throw new BusinessError("رقم الجوال السعودي غير صحيح");
  }

  return normalized;
}
