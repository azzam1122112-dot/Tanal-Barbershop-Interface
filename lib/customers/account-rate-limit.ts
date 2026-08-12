import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { consumeRateLimit, type RateLimitPolicy } from "@/lib/auth/rate-limit";

/**
 * حدود مسارات حساب العميل.
 *
 * **مفتاحان لكل مسار: العنوان والمعرّف.** القفل على المعرّف وحده يجعل مهاجمًا
 * يقفل حساب غيره متى شاء، والقفل على العنوان وحده يسقط أمام شبكة عناوين. كلاهما
 * معًا: من يهاجم حسابًا واحدًا يُقفل بالمعرّف، ومن يجرّب حسابات كثيرة يُقفل بالعنوان.
 */
const POLICIES = {
  /** التسجيل: إنشاء حسابات بالجملة يُغرق جدول الهوية ويستهلك إرسال البريد. */
  register: { windowMs: 15 * 60_000, maxAttempts: 5, lockMs: 30 * 60_000 },
  login: { windowMs: 5 * 60_000, maxAttempts: 8, lockMs: 15 * 60_000 },
  /** الإرسال أغلى من التحقق: كل نداء رسالة فعلية. */
  challengeSend: { windowMs: 15 * 60_000, maxAttempts: 4, lockMs: 30 * 60_000 },
  challengeVerify: { windowMs: 10 * 60_000, maxAttempts: 10, lockMs: 15 * 60_000 },
} satisfies Record<string, RateLimitPolicy>;

export type CustomerRateLimitScope = keyof typeof POLICIES;

const RATE_LIMITED_MESSAGE = "محاولات كثيرة. يرجى المحاولة بعد قليل.";

/**
 * يستهلك حدّي العنوان والمعرّف معًا ويعيد ردًّا جاهزًا عند التجاوز.
 *
 * الاستهلاك يتم للاثنين دائمًا ولا يتوقف عند أول تجاوز: التوقف المبكر يجعل زمن
 * الرد يختلف حسب أيّ الحدّين ضُرب، وهو فارق يُقرأ من الخارج.
 */
export async function consumeCustomerRateLimit(
  scope: CustomerRateLimitScope,
  input: { ipAddress?: string | null; identifier?: string | null },
) {
  const policy = POLICIES[scope];
  const results = await Promise.all([
    consumeRateLimit(prisma, `customer:${scope}:ip:${input.ipAddress ?? "unknown"}`, undefined, policy),
    input.identifier
      ? consumeRateLimit(prisma, `customer:${scope}:id:${input.identifier.toLowerCase()}`, undefined, policy)
      : Promise.resolve({ limited: false, retryAfterSeconds: 0 }),
  ]);

  const blocked = results.find((result) => result.limited);
  if (!blocked) return null;

  return NextResponse.json(
    { message: RATE_LIMITED_MESSAGE },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } },
  );
}
