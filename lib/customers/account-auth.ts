import { Prisma, type PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { logger } from "@/lib/logger";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/email/normalize-email";
import { toSaudiE164 } from "@/lib/phone/saudi-phone";
import { assertChallengeUsable, consumeEmailChallenge, issueEmailChallenge } from "@/lib/customers/account-challenge";
import { createCustomerSession, revokeAllCustomerSessions } from "@/lib/customers/account-session";

/**
 * مصادقة حساب العميل العالمي.
 *
 * **حدود هذه الطبقة:** لا تنشئ `Customer` في أي مؤسسة، ولا تربط عميلًا قديمًا،
 * ولا تقرأ ولاءً ولا زيارة. حسابٌ بلا أي مؤسسة حالة صحيحة تمامًا — الربط فعل
 * مستقل في مرحلة المطالبة.
 */

export type ActorMeta = { ipAddress?: string | null; userAgent?: string | null };

const GENERIC_LOGIN_ERROR = "بيانات الدخول غير صحيحة";

export type RegisterResult =
  | { outcome: "CREATED"; accountId: string }
  /** حساب قائم لم يُفعَّل بريده: أُعيد إرسال الرمز ولم يُنشأ صف ثانٍ. */
  | { outcome: "VERIFICATION_RESENT"; accountId: string }
  /**
   * الحساب أُنشئ لكن الإرسال فشل. **حالة نجاح جزئي لا فشل**: إخفاؤها يجعل
   * صاحبه يعيد المحاولة فيصطدم بـ«البريد مستعمل» ولا يفهم لماذا.
   */
  | { outcome: "ACCOUNT_CREATED_VERIFICATION_PENDING"; accountId: string }
  | { outcome: "EMAIL_TAKEN" };

export async function registerCustomerAccount(
  prisma: PrismaClient,
  input: { name: string; phone: string; email: string; password: string },
  meta: ActorMeta = {},
): Promise<RegisterResult> {
  const name = input.name.trim();
  if (name.length < 2) throw new BusinessError("الاسم مطلوب");

  // الرقم يُطبَّع للعرض والتواصل فقط. **لا يُكتب في `phoneNormalized`** ولا
  // يُفحص تكراره: من كتبه لم يثبت ملكيته، ورفضُ تسجيلِ من يشاركه الرقم يعني أن
  // أول من كتب رقمًا يحرم صاحبه الحقيقي منه إلى الأبد.
  const phone = toSaudiE164(input.phone);
  const emailNormalized = normalizeEmail(input.email);
  const passwordHash = await hashAdminPassword(input.password);

  const existing = await prisma.customerAccount.findUnique({ where: { emailNormalized } });
  if (existing) {
    // حساب لم يُفعَّل بعد بنفس البريد: المخرج إعادة إرسال الرمز لا صف ثانٍ.
    if (!existing.emailVerifiedAt) {
      return withPendingVerification(prisma, existing.id, meta, "VERIFICATION_RESENT");
    }
    return { outcome: "EMAIL_TAKEN" };
  }

  let account;
  try {
    account = await prisma.customerAccount.create({
      data: {
        name,
        phone,
        // الرقم المُثبَت وحده يدخل نطاق التفرّد، ولا إثبات اليوم.
        phoneNormalized: null,
        phoneVerifiedAt: null,
        email: input.email.trim(),
        emailNormalized,
        passwordHash,
        // البريد غير موثّق حتى ينجح التحدي — وبلا توثيق لا جلسة.
        emailVerifiedAt: null,
      },
    });
  } catch (error) {
    // خط الدفاع الأخير هو قيد القاعدة: فحصان متزامنان قد يمرّان معًا.
    if (isEmailConflict(error)) return { outcome: "EMAIL_TAKEN" };
    throw error;
  }

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.registered",
    entityType: "CustomerAccount",
    entityId: account.id,
    ...meta,
  });

  return withPendingVerification(prisma, account.id, meta, "CREATED");
}

/**
 * يرسل رمز التفعيل، ويحوّل فشل الإرسال إلى **نجاح جزئي معلن** لا إلى خطأ.
 *
 * الحساب أُنشئ فعلًا وحجز بريده. لو ردّ المسار خطأً لظن صاحبه أن التسجيل لم يقع،
 * فأعاده فاصطدم بـ«البريد مستعمل» بلا تفسير. والحذف التلقائي عند الفشل بديل
 * أسوأ: سباقٌ يحذف حسابًا بينما رمزه في الطريق. المخرج الصحيح: أعلِن أن الحساب
 * جاهز وأن الإرسال تعثّر، ووجّهه لإعادة الإرسال.
 */
async function withPendingVerification(
  prisma: PrismaClient,
  accountId: string,
  meta: ActorMeta,
  success: "CREATED" | "VERIFICATION_RESENT",
): Promise<RegisterResult> {
  try {
    await sendVerificationChallenge(prisma, accountId, meta);
    return { outcome: success, accountId };
  } catch (error) {
    logger.warn("customer_account.verification_send_failed", { accountId, error });
    return { outcome: "ACCOUNT_CREATED_VERIFICATION_PENDING", accountId };
  }
}

function isEmailConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => field.includes("emailNormalized"));
}

export async function sendVerificationChallenge(prisma: PrismaClient, accountId: string, meta: ActorMeta = {}) {
  const account = await prisma.customerAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { id: true, name: true, email: true, emailVerifiedAt: true, status: true },
  });
  if (account.status !== "ACTIVE") throw new BusinessError("الحساب غير نشط", 403);
  if (account.emailVerifiedAt) throw new BusinessError("البريد موثّق مسبقًا");
  if (!account.email) throw new BusinessError("لا يوجد بريد لهذا الحساب");

  await issueEmailChallenge(prisma, {
    customerAccountId: account.id,
    purpose: "EMAIL_VERIFICATION",
    email: account.email,
    accountName: account.name,
  });

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.verification_sent",
    entityType: "CustomerAccount",
    entityId: account.id,
    ...meta,
  });
}

/** يفعّل البريد ثم يفتح جلسة مباشرة — الشخص أثبت للتوّ ملكيته للبريد. */
export async function verifyCustomerEmail(
  prisma: PrismaClient,
  input: { email: string; code: string },
  meta: ActorMeta = {},
) {
  const emailNormalized = normalizeEmail(input.email);
  const account = await prisma.customerAccount.findUnique({ where: { emailNormalized } });
  // لا نميّز «بريد غير مسجّل» عن «رمز خاطئ»: كلاهما رمز لا يعمل.
  if (!account || account.status !== "ACTIVE") throw new BusinessError("الرمز غير صحيح أو انتهت صلاحيته.", 400);
  if (account.emailVerifiedAt) throw new BusinessError("البريد موثّق مسبقًا");

  assertChallengeUsable(
    await consumeEmailChallenge(prisma, { customerAccountId: account.id, purpose: "EMAIL_VERIFICATION", code: input.code }),
  );

  const now = new Date();
  await prisma.customerAccount.update({ where: { id: account.id }, data: { emailVerifiedAt: now, lastLoginAt: now } });
  const { token } = await createCustomerSession(prisma, { customerAccountId: account.id, ...meta });

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.email_verified",
    entityType: "CustomerAccount",
    entityId: account.id,
    ...meta,
  });

  return { token, accountId: account.id };
}

export type LoginResult =
  | { outcome: "SUCCESS"; token: string; accountId: string }
  /** بيانات صحيحة لكن البريد غير موثّق — لا جلسة، ويُوجَّه للتحقق. */
  | { outcome: "EMAIL_UNVERIFIED"; email: string }
  | { outcome: "INVALID" };

/**
 * دخول موحّد بالجوال أو البريد.
 *
 * **لا تفرّق الرسالة بين معرّف غير موجود وكلمة مرور خاطئة** — التفريق يحوّل
 * صفحة الدخول إلى أداة استكشاف: من يجرّب أرقامًا يعرف من له حساب.
 */
export async function loginCustomerAccount(
  prisma: PrismaClient,
  input: { identifier: string; password: string },
  meta: ActorMeta = {},
): Promise<LoginResult> {
  const account = await findAccountByIdentifier(prisma, input.identifier);

  // نقارن دائمًا ولو لم نجد حسابًا: خروجٌ مبكر يجعل زمن الرد يفرّق بين
  // «معرّف غير موجود» و«كلمة مرور خاطئة» فيعيد التسريب من باب التوقيت.
  const passwordOk = await verifyAdminPassword(input.password, account?.passwordHash ?? DUMMY_HASH);

  if (!account || !account.passwordHash || !passwordOk || account.status !== "ACTIVE") {
    await writeAuditLog({
      prisma,
      actorType: "CUSTOMER",
      action: "customer_account.login_failed",
      entityType: "CustomerAccount",
      entityId: account?.id ?? null,
      ...meta,
    });
    return { outcome: "INVALID" };
  }

  if (!account.emailVerifiedAt) {
    return { outcome: "EMAIL_UNVERIFIED", email: account.email ?? "" };
  }

  const { token } = await createCustomerSession(prisma, { customerAccountId: account.id, ...meta });
  await prisma.customerAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.login_success",
    entityType: "CustomerAccount",
    entityId: account.id,
    ...meta,
  });

  return { outcome: "SUCCESS", token, accountId: account.id };
}

/** تجزئة bcrypt صالحة لكلمة مرور لا يعرفها أحد — لموازنة زمن المقارنة فقط. */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.4Zt0eJgLPWuPBYlXQBB7VbFo9V6h1Aq";

/**
 * **البريد الموثّق هو معرّف الدخول الوحيد اليوم.**
 *
 * الدخول بالجوال معطّل عمدًا لا سهوًا: لا نملك وسيلة تثبت ملكية رقم، وتوثيق
 * البريد يثبت البريد وحده. لو قبِلنا الجوال معرّفًا لصار من يسجّل رقم غيره
 * ويوثّق بريده هو قادرًا على الدخول «بذلك الرقم» — وهي هوية لم يملكها قط.
 *
 * البنية جاهزة لإعادته: عند وجود `phoneVerifiedAt` ووسيلة إثبات (SMS أو
 * مطالبة)، يُضاف فرعٌ يبحث بـ `phoneNormalized` — وهو لا يُملأ إلا بإثبات.
 */
async function findAccountByIdentifier(prisma: PrismaClient, identifier: string) {
  const value = identifier.trim();
  if (!value || !value.includes("@")) return null;

  const emailNormalized = safely(() => normalizeEmail(value));
  return emailNormalized ? prisma.customerAccount.findUnique({ where: { emailNormalized } }) : null;
}

/** معرّف مشوّه ليس خطأ نظام — هو ببساطة لا يطابق أي حساب. */
function safely<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

/**
 * يطلب رمز استعادة. **يعيد النتيجة نفسها دائمًا** سواء وُجد الحساب أم لا:
 * ردٌّ يفرّق بينهما يجعل النموذج كاشفًا لمن له حساب.
 */
export async function requestPasswordReset(prisma: PrismaClient, email: string, meta: ActorMeta = {}) {
  const emailNormalized = safely(() => normalizeEmail(email));
  if (!emailNormalized) return;

  const account = await prisma.customerAccount.findUnique({ where: { emailNormalized } });
  // البريد غير الموثّق لا يستقبل استعادة: مساره هو التفعيل لا الاستعادة.
  if (!account || account.status !== "ACTIVE" || !account.emailVerifiedAt || !account.email) return;

  await issueEmailChallenge(prisma, {
    customerAccountId: account.id,
    purpose: "PASSWORD_RESET",
    email: account.email,
    accountName: account.name,
  });

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.password_reset_requested",
    entityType: "CustomerAccount",
    entityId: account.id,
    ...meta,
  });
}

/**
 * يعيّن كلمة مرور جديدة بعد استهلاك الرمز، **ويُلغي كل الجلسات القائمة**.
 *
 * الإلغاء جزء من الاستعادة لا خطوة اختيارية: من استعاد كلمته غالبًا يشك في
 * اختراق، وترك جلسة قديمة حيّة يُبقي المخترق داخلًا بعد الإصلاح.
 * ولا نفتح جلسة جديدة تلقائيًا — يدخل بكلمته الجديدة فيثبت أنه يحفظها.
 */
export async function resetCustomerPassword(
  prisma: PrismaClient,
  input: { email: string; code: string; password: string },
  meta: ActorMeta = {},
) {
  const emailNormalized = normalizeEmail(input.email);
  const account = await prisma.customerAccount.findUnique({ where: { emailNormalized } });
  if (!account || account.status !== "ACTIVE") throw new BusinessError("الرمز غير صحيح أو انتهت صلاحيته.", 400);

  assertChallengeUsable(
    await consumeEmailChallenge(prisma, { customerAccountId: account.id, purpose: "PASSWORD_RESET", code: input.code }),
  );

  const passwordHash = await hashAdminPassword(input.password);
  await prisma.customerAccount.update({ where: { id: account.id }, data: { passwordHash } });
  await revokeAllCustomerSessions(prisma, account.id);

  await writeAuditLog({
    prisma,
    actorType: "CUSTOMER",
    action: "customer_account.password_reset_completed",
    entityType: "CustomerAccount",
    entityId: account.id,
    ...meta,
  });
}

export { GENERIC_LOGIN_ERROR };
