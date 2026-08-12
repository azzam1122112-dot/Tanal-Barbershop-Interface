import crypto from "crypto";
import type { CustomerChallengePurpose, Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { renderCustomerEmail } from "@/lib/email/customer-email-templates";
import { sendEmail } from "@/lib/email/email-provider";

type ChallengePrisma = PrismaClient | Prisma.TransactionClient;

export const CHALLENGE_TTL_MINUTES = 10;
export const CHALLENGE_MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;

/**
 * رمز من ست خانات بعشوائية تشفيرية.
 *
 * `randomInt` لا `Math.random`: الأخيرة قابلة للتنبؤ من مخرجاتها، ورمزٌ يُخمَّن
 * يعني تفعيل بريد شخص آخر. والنطاق مضبوط ليمنع انحياز البواقي.
 */
export function generateChallengeCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/**
 * بصمة الرمز المخزَّنة: **HMAC بسرّ خادم لا تجزئة عارية**.
 *
 * الرمز ست خانات — مليون احتمال. `SHA-256(code)` عليه لا يقاوم شيئًا: من يسرق
 * قاعدة البيانات يبني جدول المليون كله في ثوانٍ ويقرأ كل رمز حيّ. HMAC بسرّ
 * خارج القاعدة يجعل التسريب وحده بلا قيمة — يلزمه سرّ الخادم أيضًا.
 *
 * والمدخل مربوط بـ `challengeId` و`purpose`: فصلُ النطاق يمنع نقل بصمة من تحدٍّ
 * إلى آخر، ويجعل رمزين متطابقين في صفّين مختلفين ببصمتين مختلفتين — فلا يُستدل
 * من تكرار البصمة على تكرار الرمز.
 */
export function hashChallengeCode(input: { challengeId: string; purpose: CustomerChallengePurpose; code: string }) {
  return crypto
    .createHmac("sha256", getOtpPepper())
    .update(`${input.challengeId}:${input.purpose}:${input.code}`)
    .digest("hex");
}

/**
 * سرّ الخادم لبصمات الرموز — من البيئة وحدها.
 *
 * الغياب خطأ إعداد يُرفع لا قيمة افتراضية تُختلق: قيمة مضمَّنة في الشيفرة تعني
 * أن كل نسخة من المستودع تعرف السرّ، فيسقط الغرض كله.
 *
 * **التدوير يُبطل التحديات القائمة** — وهو مقبول لأن عمرها عشر دقائق، ولذلك لا
 * حاجة لترقيم إصدارات مفاتيح.
 */
function getOtpPepper() {
  const pepper = process.env.CUSTOMER_OTP_PEPPER?.trim();
  if (!pepper) {
    throw new BusinessError("سرّ رموز التحقق غير مهيّأ على هذا الخادم. راجع مشغّل النظام.", 503);
  }
  return pepper;
}

/**
 * مقارنة ثابتة الزمن.
 *
 * المقارنة النصية `===` تتوقف عند أول حرف مختلف، فزمنها يسرّب عدد الحروف
 * الصحيحة من بداية البصمة. واختلاف الطول يُحسم قبل `timingSafeEqual` لأنها ترمي
 * عند اختلاف الأطوال — ورميٌ هنا يعني 500 بدل «رمز خاطئ».
 */
export function safeCompare(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * يصدر تحديًا جديدًا ويرسله، بعد **إبطال كل تحدٍّ سابق لنفس الغرض**.
 *
 * الإبطال شرط لا تحسين: لو بقي القديم صالحًا لصار كل «إعادة إرسال» رمزًا حيًّا
 * إضافيًا، فيتضاعف سطح التخمين مع كل ضغطة زر بدل أن يبقى ثابتًا.
 *
 * **الإرسال قبل الالتزام:** لو فشل المزوّد بعد كتابة التحدي لبقي رمز حيّ لم يصل
 * صاحبه، ولأبطلنا رمزًا سابقًا كان يعمل. لذلك الترتيب: أنشئ → أرسل → واترك
 * الفشل يرتد للمستدعي داخل معاملته.
 */
export async function issueEmailChallenge(
  prisma: ChallengePrisma,
  input: {
    customerAccountId: string;
    purpose: CustomerChallengePurpose;
    email: string;
    accountName: string;
  },
) {
  const now = new Date();
  await prisma.customerEmailChallenge.updateMany({
    where: { customerAccountId: input.customerAccountId, purpose: input.purpose, consumedAt: null },
    data: { consumedAt: now },
  });

  const code = generateChallengeCode();
  // البصمة مربوطة بمعرّف التحدي، والمعرّف لا يُعرف قبل الإنشاء. لذلك تُكتب أولًا
  // سلسلة فارغة — لا رمز يطابقها إطلاقًا — ثم تُستبدل بالبصمة الحقيقية. النافذة
  // بينهما مغلقة لا مفتوحة: التحدي في تلك اللحظة لا يقبل أي رمز.
  const challenge = await prisma.customerEmailChallenge.create({
    data: {
      customerAccountId: input.customerAccountId,
      purpose: input.purpose,
      codeHash: "",
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MINUTES * 60 * 1000),
    },
  });
  await prisma.customerEmailChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: hashChallengeCode({ challengeId: challenge.id, purpose: input.purpose, code }) },
  });

  const subject = input.purpose === "EMAIL_VERIFICATION" ? "رمز تفعيل حسابك" : "رمز إعادة تعيين كلمة المرور";
  const template = renderCustomerEmail({
    preheader: subject,
    title: subject,
    body: [
      `مرحبًا ${input.accountName}،`,
      `رمزك هو: ${code}`,
      `صالح لمدة ${CHALLENGE_TTL_MINUTES} دقائق ولاستعمال واحد.`,
      "إن لم تطلب هذا الرمز فتجاهل الرسالة ولا تشاركه مع أحد.",
    ],
  });
  await sendEmail({
    to: input.email,
    subject,
    ...template,
    idempotencyKey: `customer-challenge/${challenge.id}`,
    tags: [{
      name: "message_type",
      value: input.purpose === "EMAIL_VERIFICATION" ? "account_verification" : "password_reset",
    }],
  });

  return { challengeId: challenge.id };
}

export type ChallengeConsumeResult =
  | { outcome: "CONSUMED"; challengeId: string }
  | { outcome: "INVALID" }
  | { outcome: "EXHAUSTED" };

/**
 * يستهلك التحدي بمطابقة الرمز.
 *
 * **رسالة واحدة لكل حالات الفشل** (`INVALID`): «منتهٍ» و«خاطئ» و«لا يوجد تحدٍّ»
 * تبدو كلها واحدة للمستدعي، فلا يتعلّم المخمّن أنه أصاب البريد وأخطأ الرمز.
 * `EXHAUSTED` وحدها متميّزة لأن صاحبها يحتاج معرفة أن عليه طلب رمز جديد.
 *
 * **ترتيب الخطوات مقصود ضد التزامن:**
 * 1. جلب أحدث تحدٍّ غير مستهلَك.
 * 2. **زيادة العدّاد فورًا بعملية ذرّية** قبل أي مقارنة — فمحاولة تُحسب حتى لو
 *    انقطع الطلب بعدها، ولا يستطيع طلبان متزامنان أن يقرآ العدّاد نفسه
 *    ويكتباه فتضيع إحدى المحاولتين. الزيادة خارج أي معاملة عمدًا: لو كانت
 *    داخل معاملة تفشل عند الرمز الخاطئ لَتراجعت مع الفشل، فصار التخمين مجانيًا.
 * 3. الحد ثم الصلاحية، من القيم المُعادة بعد الزيادة لا من اللقطة القديمة.
 * 4. مقارنة ثابتة الزمن.
 * 5. **استهلاك مشروط ذرّي**: `updateMany` بشرط `consumedAt = null`، والنجاح هو
 *    `count === 1` وحده. طلبان بالرمز الصحيح معًا يمرّان بالمقارنة كلاهما،
 *    ولا يظفر بالتحدي إلا من كتب الشرط أولًا؛ الآخر يُردّ `INVALID`. الفحص
 *    الاستباقي `if (!consumedAt)` كان سيمرّرهما معًا.
 */
export async function consumeEmailChallenge(
  prisma: ChallengePrisma,
  input: { customerAccountId: string; purpose: CustomerChallengePurpose; code: string },
): Promise<ChallengeConsumeResult> {
  const challenge = await prisma.customerEmailChallenge.findFirst({
    where: { customerAccountId: input.customerAccountId, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!challenge) return { outcome: "INVALID" };

  const attempted = await prisma.customerEmailChallenge.update({
    where: { id: challenge.id },
    data: { attemptCount: { increment: 1 } },
    select: { attemptCount: true, codeHash: true, expiresAt: true, purpose: true },
  });

  if (attempted.attemptCount > CHALLENGE_MAX_ATTEMPTS) return { outcome: "EXHAUSTED" };
  if (attempted.expiresAt <= new Date()) return { outcome: "INVALID" };

  const expected = hashChallengeCode({ challengeId: challenge.id, purpose: attempted.purpose, code: input.code });
  if (!safeCompare(attempted.codeHash, expected)) {
    return attempted.attemptCount >= CHALLENGE_MAX_ATTEMPTS ? { outcome: "EXHAUSTED" } : { outcome: "INVALID" };
  }

  const consumed = await prisma.customerEmailChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  // خسر السباق: تحدٍّ استُهلك مرة واحدة فقط مهما تزامنت الطلبات.
  if (consumed.count !== 1) return { outcome: "INVALID" };

  return { outcome: "CONSUMED", challengeId: challenge.id };
}

export function assertChallengeUsable(result: ChallengeConsumeResult) {
  if (result.outcome === "EXHAUSTED") {
    throw new BusinessError("انتهت محاولات هذا الرمز. اطلب رمزًا جديدًا.", 429);
  }
  if (result.outcome === "INVALID") {
    throw new BusinessError("الرمز غير صحيح أو انتهت صلاحيته.", 400);
  }
}
