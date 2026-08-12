import { Prisma } from "@prisma/client";
import type { LoyaltyTransaction, LoyaltyTransactionType, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

type LedgerPrisma = PrismaClient | Prisma.TransactionClient;

export type LoyaltyMovementInput = {
  organizationId: string;
  customerId: string;
  type: LoyaltyTransactionType;
  /** موجب يزيد الرصيد وسالب ينقصه. الصفر مرفوض: حركة لا تغيّر شيئًا ضجيج في الدفتر. */
  points: number;
  /** الفرع الذي وقعت فيه الحركة — للتقارير فقط. */
  salonId?: string | null;
  visitId?: string | null;
  description?: string | null;
  recordedByUserId?: string | null;
  recordedByBarberId?: string | null;
};

/**
 * البوابة الوحيدة لتغيير رصيد نقاط العميل.
 *
 * **لماذا دالة واحدة:** الرصيد كان يُكتب في أربعة مواضع، كلٌّ منها يحسب الرصيد
 * الجديد بنفسه ثم يكتب حركة الدفتر بجانبه. أي موضع خامس ينسى الحركة يترك رصيدًا
 * تغيّر بلا سبب مسجَّل. هنا الكتابتان فعل واحد لا يمكن فصله — نفس دور
 * `recordStockMovement` مع المخزون.
 *
 * **نطاق الرصيد المؤسسة لا الفرع:** الحساب يُجلب بـ `customerId + organizationId`
 * ولا يدخل `salonId` في تحديده إطلاقًا. زيارة فرع آخر تكتب في نفس الحساب،
 * و`salonId` يُخزَّن على الحركة ليجيب تقرير الفرع لاحقًا.
 *
 * **لا تُنشئ عضوية:** عميل بلا حساب ولاء تُرفض حركته. الاشتراك قرار صريح في مسار
 * إنشاء العميل، ولا يجوز أن ينشأ كأثر جانبي لعملية أخرى.
 *
 * يجب أن تُستدعى داخل معاملة `Serializable` — القراءة والتعديل خطوتان، وبلا عزل
 * تسلسلي تضيع إحدى حركتين متزامنتين على نفس الرصيد.
 */
export async function recordLoyaltyMovement(
  tx: LedgerPrisma,
  input: LoyaltyMovementInput,
): Promise<LoyaltyTransaction> {
  const points = Math.trunc(input.points);
  if (points === 0) {
    throw new BusinessError("حركة نقاط بلا مقدار");
  }

  const account = await tx.loyaltyAccount.findFirst({
    where: { customerId: input.customerId, organizationId: input.organizationId },
    select: { id: true, points: true },
  });
  if (!account) {
    throw new BusinessError("العميل غير مشترك في برنامج الولاء");
  }

  await assertSalonInOrganization(tx, input.salonId, input.organizationId);

  const balanceBefore = account.points;
  const balanceAfter = balanceBefore + points;
  if (balanceAfter < 0) {
    throw new BusinessError("رصيد النقاط غير كافٍ");
  }

  // الرصيد المخزَّن لقطة مشتقة من الدفتر، ويُحدَّث في نفس المعاملة مع الحركة.
  await tx.loyaltyAccount.update({
    where: { id: account.id },
    data: {
      points: balanceAfter,
      lifetimeEarned: input.type === "EARN" && points > 0 ? { increment: points } : undefined,
      lifetimeRedeemed: input.type === "REDEEM" && points < 0 ? { increment: -points } : undefined,
    },
  });

  return tx.loyaltyTransaction.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      salonId: input.salonId ?? null,
      visitId: input.visitId ?? null,
      type: input.type,
      points,
      balanceBefore,
      balanceAfter,
      description: input.description?.trim() || null,
      recordedByUserId: input.recordedByUserId ?? null,
      recordedByBarberId: input.recordedByBarberId ?? null,
    },
  });
}

/**
 * فرع من مؤسسة أخرى مع عضوية هذه المؤسسة = محاولة عبور مستأجرين.
 *
 * القيد المركّب في القاعدة (`LoyaltyTransaction_salon_tenant_fkey`) يمنعها أصلًا،
 * لكنه يفشل بخطأ قاعدة بيانات خام. الفحص هنا يردّها برسالة أعمال ويجعل النية
 * مقروءة في الكود لا مدفونة في هجرة.
 */
async function assertSalonInOrganization(tx: LedgerPrisma, salonId: string | null | undefined, organizationId: string) {
  if (!salonId) return;
  const salon = await tx.salon.findFirst({
    where: { id: salonId, organizationId },
    select: { id: true },
  });
  if (!salon) {
    throw new BusinessError("الفرع لا يتبع مؤسسة العميل", 403);
  }
}

/**
 * رصيد نقاط العميل، أو `null` إن لم يكن مشتركًا.
 *
 * **قراءة خالصة:** لا تُنشئ حسابًا ولا تكتب شيئًا. قراءة الرصيد لا يجوز أن تُدخل
 * العميل في برنامج الولاء.
 */
export async function getLoyaltyBalance(tx: LedgerPrisma, customerId: string): Promise<number | null> {
  const account = await tx.loyaltyAccount.findUnique({
    where: { customerId },
    select: { points: true },
  });
  return account?.points ?? null;
}
