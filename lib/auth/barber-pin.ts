import bcrypt from "bcryptjs";
import { z } from "zod";

export const barberPinSchema = z
  .string()
  .regex(/^\d+$/, "رمز الدخول يجب أن يحتوي على أرقام فقط")
  .refine((value) => value.length === 4 || value.length === 6, {
    message: "رمز الدخول يجب أن يكون 4 أو 6 أرقام",
  });

export function validateBarberPin(pin: string) {
  return barberPinSchema.parse(pin);
}

export async function hashBarberPin(pin: string) {
  const validPin = validateBarberPin(pin);
  return bcrypt.hash(validPin, 12);
}

export async function verifyBarberPin(pin: string, hash: string) {
  const validPin = validateBarberPin(pin);
  return bcrypt.compare(validPin, hash);
}
