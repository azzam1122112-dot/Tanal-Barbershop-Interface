import { z } from "zod";
import { adminPasswordSchema } from "@/lib/auth/password";

/**
 * تحقق الخادم لمسارات حساب العميل.
 *
 * كلمة المرور تعيد استعمال `adminPasswordSchema`: من 8 إلى 64 حرفًا بلا شرط
 * تعقيد. العبارة الطويلة مسموحة، والحد الأعلى يمنع إغراق bcrypt لا أكثر —
 * لا نظام تجزئة ثانٍ ولا سياسة ثانية.
 */
export const customerRegisterSchema = z
  .object({
    name: z.string().trim().min(2, "الاسم مطلوب").max(80),
    phone: z.string().trim().min(1, "رقم الجوال مطلوب"),
    email: z.string().trim().min(3).max(254),
    password: adminPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });

export const customerLoginSchema = z.object({
  identifier: z.string().trim().min(1, "أدخل رقم جوالك أو بريدك"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const customerVerifySchema = z.object({
  email: z.string().trim().min(3).max(254),
  code: z.string().trim().regex(/^\d{6}$/, "الرمز ست خانات"),
});

export const customerResendSchema = z.object({
  email: z.string().trim().min(3).max(254),
});

export const customerForgotPasswordSchema = customerResendSchema;

export const customerResetPasswordSchema = z
  .object({
    email: z.string().trim().min(3).max(254),
    code: z.string().trim().regex(/^\d{6}$/, "الرمز ست خانات"),
    password: adminPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });
