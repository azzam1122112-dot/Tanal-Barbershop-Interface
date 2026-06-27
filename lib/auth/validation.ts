import { z } from "zod";
import { barberPinSchema } from "./barber-pin";
import { adminPasswordSchema } from "./password";
import { normalizeSaudiPhone, SAUDI_LOCAL_MOBILE_MESSAGE } from "@/lib/phone/saudi-phone";

export const emailSchema = z
  .string()
  .trim()
  .email("البريد الإلكتروني غير صحيح")
  .transform((value) => value.toLowerCase());

export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return normalizeSaudiPhone(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: SAUDI_LOCAL_MOBILE_MESSAGE });
      return z.NEVER;
    }
  });

export const dashboardLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "كلمة المرور مطلوبة"),
  organizationSlug: z.string().trim().max(60).optional(),
});

const RESERVED_SLUGS = new Set(["www", "app", "api", "admin", "dashboard", "platform", "default", "tanal", "main"]);

export const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "المعرّف يجب أن يكون 3-40 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو شرطات")
  .refine((value) => !RESERVED_SLUGS.has(value), "هذا المعرّف محجوز، اختر غيره");

export const signupSchema = z.object({
  organizationName: z.string().trim().min(2, "اسم المؤسسة مطلوب"),
  // المعرّف اختياري: يُولَّد تلقائيًا إن لم يُرسَل (الدخول يعتمد على البريد/الجوال لا المعرّف).
  slug: organizationSlugSchema.optional(),
  salonName: z.string().trim().min(2, "اسم الصالون مطلوب").optional(),
  ownerName: z.string().trim().min(2, "اسم المالك مطلوب"),
  email: emailSchema,
  phone: phoneSchema,
  password: adminPasswordSchema,
});

export const salonCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم الصالون مطلوب"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "معرّف الصالون يجب أن يكون أحرفًا إنجليزية صغيرة أو أرقامًا أو شرطات"),
});

export const salonUpdateSchema = z.object({
  name: z.string().trim().min(2, "اسم الصالون مطلوب").optional(),
  isActive: z.boolean().optional(),
});

export const barberLoginSchema = z.object({
  phone: phoneSchema,
  pin: barberPinSchema,
  organizationSlug: z.string().trim().max(60).optional(),
});

export const createBarberSchema = z.object({
  name: z.string().trim().min(2, "اسم الحلاق مطلوب"),
  phone: phoneSchema,
  pin: barberPinSchema,
  salonId: z.string().trim().min(1, "الفرع مطلوب"),
});

export const updateBarberSchema = z.object({
  name: z.string().trim().min(2, "اسم الحلاق مطلوب").optional(),
  phone: phoneSchema.optional(),
  isActive: z.boolean().optional(),
  salonId: z.string().trim().min(1, "الفرع مطلوب").optional(),
});

export const resetBarberPinSchema = z.object({
  pin: barberPinSchema,
});

export const staffRoleSchema = z.enum(["ADMIN", "SUPERVISOR"], {
  message: "صلاحية الموظف غير صحيحة",
});

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "اسم الموظف مطلوب"),
  email: emailSchema,
  phone: phoneSchema,
  password: adminPasswordSchema,
  role: staffRoleSchema,
});

export const updateStaffSchema = z.object({
  name: z.string().trim().min(2, "اسم الموظف مطلوب").optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  role: staffRoleSchema.optional(),
  isActive: z.boolean().optional(),
  password: adminPasswordSchema.optional(),
});

export const customerCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم العميل مطلوب"),
  phone: phoneSchema,
});

export const customerSearchSchema = z.object({
  phone: phoneSchema,
});

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم الخدمة مطلوب"),
  defaultPrice: z.coerce.number().nonnegative("السعر لا يمكن أن يكون سالبًا"),
  sortOrder: z.coerce.number().int("الترتيب يجب أن يكون رقمًا صحيحًا").default(0),
  isActive: z.boolean().optional(),
});

export const serviceUpdateSchema = z.object({
  name: z.string().trim().min(2, "اسم الخدمة مطلوب").optional(),
  defaultPrice: z.coerce.number().nonnegative("السعر لا يمكن أن يكون سالبًا").optional(),
  sortOrder: z.coerce.number().int("الترتيب يجب أن يكون رقمًا صحيحًا").optional(),
  isActive: z.boolean().optional(),
});

export const visitPaymentMethodSchema = z.enum(["CASH", "NETWORK"], {
  message: "طريقة الدفع غير صحيحة",
});

export const visitRequestSchema = z.object({
  customerId: z.string().trim().min(1, "العميل مطلوب"),
  serviceIds: z.array(z.string().trim().min(1)).min(1, "اختر خدمة واحدة على الأقل"),
  grossAmount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  paymentMethod: visitPaymentMethodSchema,
  rewardRuleId: z.string().trim().min(1).optional(),
  managerRewardId: z.string().trim().min(1).optional(),
  campaignId: z.string().trim().min(1).optional(),
});

export const visitConfirmRequestSchema = visitRequestSchema.extend({
  idempotencyKey: z.string().trim().min(8, "مفتاح منع التكرار مطلوب").max(120),
});

export const rewardRuleCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم المكافأة مطلوب").optional(),
  requiredPoints: z.coerce.number().int().positive("النقاط المطلوبة يجب أن تكون أكبر من صفر"),
  discountAmount: z.coerce.number().positive("قيمة الخصم يجب أن تكون أكبر من صفر"),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export const rewardRuleUpdateSchema = z.object({
  name: z.string().trim().min(2, "اسم المكافأة مطلوب").optional(),
  requiredPoints: z.coerce.number().int().positive("النقاط المطلوبة يجب أن تكون أكبر من صفر").optional(),
  discountAmount: z.coerce.number().positive("قيمة الخصم يجب أن تكون أكبر من صفر").optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const managerRewardCreateSchema = z.object({
  title: z.string().trim().min(2, "عنوان المكافأة مطلوب").default("مكافأة من الإدارة"),
  description: z.string().trim().max(500).optional().nullable(),
  discountAmount: z.coerce.number().positive("قيمة الخصم يجب أن تكون أكبر من صفر"),
  expiresAt: z.coerce.date().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.expiresAt && data.expiresAt <= new Date()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "تاريخ الانتهاء يجب أن يكون في المستقبل" });
  }
});

export const campaignDiscountTypeSchema = z.enum(["FIXED_AMOUNT", "PERCENTAGE"], {
  message: "نوع الخصم غير صحيح",
});

export const campaignTargetTypeSchema = z.enum(
  ["ALL_CUSTOMERS", "NEW_CUSTOMERS", "INACTIVE_CUSTOMERS", "CUSTOMERS_WITH_MIN_POINTS"],
  { message: "نوع الاستهداف غير صحيح" },
);

const campaignFields = z.object({
  name: z.string().trim().min(2, "اسم الحملة مطلوب"),
  description: z.string().trim().max(500).optional().nullable(),
  discountType: campaignDiscountTypeSchema,
  discountValue: z.coerce.number().positive("قيمة الخصم يجب أن تكون أكبر من صفر"),
  targetType: campaignTargetTypeSchema,
  inactiveDays: z.coerce.number().int().positive("عدد أيام الانقطاع يجب أن يكون أكبر من صفر").optional().nullable(),
  minPoints: z.coerce.number().int().positive("الحد الأدنى للنقاط يجب أن يكون أكبر من صفر").optional().nullable(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  maxUsesPerCustomer: z.coerce.number().int().positive("عدد الاستخدامات يجب أن يكون أكبر من صفر").default(1),
  isActive: z.boolean().optional(),
});

export const campaignCreateSchema = campaignFields.superRefine((data, ctx) => {
    if (data.discountType === "PERCENTAGE" && data.discountValue > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "النسبة لا يمكن أن تتجاوز 100%" });
    }
    if (data.endAt <= data.startAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" });
    }
    if (data.targetType === "INACTIVE_CUSTOMERS" && !data.inactiveDays) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inactiveDays"], message: "عدد أيام الانقطاع مطلوب لهذه الحملة" });
    }
    if (data.targetType === "CUSTOMERS_WITH_MIN_POINTS" && !data.minPoints) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["minPoints"], message: "الحد الأدنى للنقاط مطلوب لهذه الحملة" });
    }
  });

export const campaignUpdateSchema = campaignFields.partial().superRefine((data, ctx) => {
  if (data.discountType === "PERCENTAGE" && data.discountValue !== undefined && data.discountValue > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "النسبة لا يمكن أن تتجاوز 100%" });
  }
  if (data.startAt && data.endAt && data.endAt <= data.startAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" });
  }
  if (data.targetType === "INACTIVE_CUSTOMERS" && !data.inactiveDays) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inactiveDays"], message: "عدد أيام الانقطاع مطلوب لهذه الحملة" });
  }
  if (data.targetType === "CUSTOMERS_WITH_MIN_POINTS" && !data.minPoints) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["minPoints"], message: "الحد الأدنى للنقاط مطلوب لهذه الحملة" });
  }
});

export const dailyCloseSchema = z.object({
  barberId: z.string().trim().min(1, "الحلاق مطلوب"),
  date: z.coerce.date(),
  cashReceivedAmount: z.coerce.number().nonnegative("المبلغ المستلم لا يمكن أن يكون سالبًا").optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const cashSessionCloseSchema = z.object({
  cashSessionId: z.string().trim().min(1).optional(),
  barberId: z.string().trim().min(1).optional(),
  cashReceivedAmount: z.coerce.number().nonnegative("المبلغ المستلم لا يمكن أن يكون سالبًا").optional(),
  notes: z.string().trim().max(500).optional().nullable(),
}).refine((data) => data.cashSessionId || data.barberId, {
  message: "اختر جلسة صندوق أو حلاقًا",
  path: ["cashSessionId"],
});

export const visitCancelSchema = z.object({
  reason: z.string().trim().min(5, "سبب الإلغاء مطلوب"),
});

export const visitPaymentMethodUpdateSchema = z.object({
  paymentMethod: visitPaymentMethodSchema,
  reason: z.string().trim().min(5, "سبب التعديل مطلوب"),
});

export const visitAmountUpdateSchema = z.object({
  grossAmount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  reason: z.string().trim().min(5, "سبب التعديل مطلوب"),
});

export const whatsappTemplateTypeSchema = z.enum(["POST_VISIT", "REWARD_READY", "CAMPAIGN", "INACTIVE_CUSTOMER", "CUSTOM"], {
  message: "نوع قالب واتساب غير صحيح",
});

export const whatsappMessageStatusSchema = z.enum(["DRAFTED", "OPENED", "MARKED_SENT", "SKIPPED", "FAILED"], {
  message: "حالة رسالة واتساب غير صحيحة",
});

export const whatsappTemplateCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم القالب مطلوب"),
  type: whatsappTemplateTypeSchema,
  body: z.string().trim().min(5, "نص القالب مطلوب").max(2000, "نص القالب طويل جدًا"),
  isActive: z.boolean().optional(),
});

export const whatsappTemplateUpdateSchema = whatsappTemplateCreateSchema.partial();

export const whatsappGenerateSchema = z.object({
  customerId: z.string().trim().min(1, "العميل مطلوب"),
  templateId: z.string().trim().min(1, "القالب مطلوب").optional(),
  contextType: whatsappTemplateTypeSchema.optional(),
  visitId: z.string().trim().min(1).optional(),
  campaignId: z.string().trim().min(1).optional(),
  customMessage: z.string().trim().min(1).max(2000).optional(),
}).refine((data) => data.templateId || data.customMessage, {
  message: "اختر قالبًا أو اكتب رسالة مخصصة",
  path: ["templateId"],
});

export const whatsappMessageListSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: whatsappMessageStatusSchema.optional(),
  templateType: whatsappTemplateTypeSchema.optional(),
  customerId: z.string().trim().min(1).optional(),
});

export const whatsappInactiveAudienceSchema = z.object({
  days: z.coerce.number().int().positive().default(30),
});

export const customerWhatsappPreferenceSchema = z.object({
  whatsappOptIn: z.boolean(),
});

export const systemSettingsUpdateSchema = z.object({
  salonName: z.string().trim().min(2, "اسم الصالون مطلوب").optional(),
  currency: z.string().trim().min(2).max(8).optional(),
  pointsPerCurrencyUnit: z.coerce.number().positive("قيمة النقاط يجب أن تكون أكبر من صفر").optional(),
  whatsappEnabled: z.boolean().optional(),
});
