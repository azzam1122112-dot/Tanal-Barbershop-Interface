import type { Organization, Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

type GuardPrisma = PrismaClient | Prisma.TransactionClient;

type SubscriptionOrganization = Pick<
  Organization,
  "id" | "status" | "subscriptionStatus" | "trialEndsAt" | "currentPeriodEnd"
>;

export type SubscriptionState = {
  /** هل يُسمح بالعمليات التشغيلية (فتح صندوق، تسجيل زيارة)؟ */
  canOperate: boolean;
  /** سبب المنع بصيغة تُعرض للمستخدم، أو null إن كان الاشتراك سليمًا. */
  blockReason: string | null;
  /** تحذير يُعرض قبل الانتهاء دون منع. */
  warning: string | null;
  daysLeft: number | null;
  isTrial: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** نحذّر المالك قبل انتهاء التجربة/الفترة بأسبوع. */
const WARNING_DAYS = 7;

/**
 * يقيّم حالة اشتراك المؤسسة.
 *
 * القاعدة: انتهاء الاشتراك **يوقف التشغيل** (تسجيل الزيارات وفتح الصندوق)
 * ولا يقطع الدخول للوحة — حتى يبقى المالك قادرًا على الترقية وقراءة تقاريره.
 */
export function evaluateSubscription(
  organization: SubscriptionOrganization | null,
  now: Date = new Date(),
): SubscriptionState {
  if (!organization) {
    return { canOperate: false, blockReason: "المؤسسة غير موجودة", warning: null, daysLeft: null, isTrial: false };
  }

  if (organization.status === "SUSPENDED") {
    return {
      canOperate: false,
      blockReason: "حساب المؤسسة موقوف. تواصل مع الدعم لإعادة التفعيل.",
      warning: null,
      daysLeft: null,
      isTrial: false,
    };
  }

  const isTrial = organization.subscriptionStatus === "TRIALING";
  const deadline = isTrial ? organization.trialEndsAt : organization.currentPeriodEnd;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS) : null;

  if (organization.subscriptionStatus === "CANCELED") {
    return {
      canOperate: false,
      blockReason: "انتهى اشتراك مؤسستك. جدّد الباقة لاستئناف تسجيل الزيارات.",
      warning: null,
      daysLeft,
      isTrial,
    };
  }

  if (deadline && deadline.getTime() <= now.getTime()) {
    return {
      canOperate: false,
      blockReason: isTrial
        ? "انتهت الفترة التجريبية. اختر باقة لاستئناف تسجيل الزيارات."
        : "انتهت مدة اشتراكك. جدّد الباقة لاستئناف تسجيل الزيارات.",
      warning: null,
      daysLeft,
      isTrial,
    };
  }

  // متأخر السداد: نُبقي التشغيل ونحذّر — الإيقاف الفوري يضرّ العميل قبل أن يُذكّره.
  if (organization.subscriptionStatus === "PAST_DUE") {
    return {
      canOperate: true,
      blockReason: null,
      warning: "يوجد مستحق غير مسدّد على اشتراكك. سدّد لتفادي إيقاف التشغيل.",
      daysLeft,
      isTrial,
    };
  }

  const warning =
    daysLeft !== null && daysLeft <= WARNING_DAYS
      ? isTrial
        ? `تنتهي فترتك التجريبية خلال ${daysLeft} يوم. اختر باقة قبل توقّف التشغيل.`
        : `ينتهي اشتراكك خلال ${daysLeft} يوم. جدّد الباقة قبل توقّف التشغيل.`
      : null;

  return { canOperate: true, blockReason: null, warning, daysLeft, isTrial };
}

/** يقرأ حالة الاشتراك من قاعدة البيانات. */
export async function getSubscriptionState(prisma: GuardPrisma, organizationId: string, now: Date = new Date()) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, status: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  return evaluateSubscription(organization, now);
}

/** يرمي 402 إذا كان الاشتراك لا يسمح بالتشغيل. تُستدعى قبل أي عملية مولّدة للإيراد. */
export async function assertSubscriptionActive(prisma: GuardPrisma, organizationId: string, now: Date = new Date()) {
  const state = await getSubscriptionState(prisma, organizationId, now);
  if (!state.canOperate) {
    throw new BusinessError(state.blockReason ?? "الاشتراك غير فعّال", 402);
  }
  return state;
}
