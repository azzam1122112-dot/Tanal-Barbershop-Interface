import { Prisma, type PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { createCustomerWithLoyalty } from "@/lib/customers/customer-service";
import { toSaudiLocalPhone } from "@/lib/phone/saudi-phone";
import { LEGAL_VERSION } from "@/lib/legal";

/**
 * انضمام حساب عميل عالمي إلى برنامج ولاء مؤسسة.
 *
 * ```
 * CustomerAccount ──┬── Customer @ Org A ── LoyaltyAccount A
 *                   └── Customer @ Org B ── LoyaltyAccount B
 * ```
 *
 * **الحساب لا يتكرر أبدًا.** الانضمام لمؤسسة ثانية ينشئ `Customer` ثانيًا مربوطًا
 * بنفس الحساب، لا هوية ثانية. والأرصدة منفصلة لأن كل `LoyaltyAccount` مملوك
 * لمؤسسته.
 *
 * **بلا مطالبة ولا دمج:** لا يبحث هذا المسار عن عميل قديم بنفس الرقم ليضمّه.
 * تطابق الرقم ليس إثبات هوية، وسجل قائم غير مرتبط يُبلَّغ عنه تعارضًا لا يُلتهم.
 */

export type EnrollmentResult =
  | { outcome: "ENROLLED"; customerId: string; organizationId: string; reference: string }
  /** انضمام سابق قائم — نفس الرد لضغطة ثانية أو طلب متزامن. */
  | { outcome: "ALREADY_ENROLLED"; customerId: string; organizationId: string; reference: string }
  /**
   * سجل عميل بنفس الرقم داخل المؤسسة وغير مرتبط بأي حساب.
   * لا دمج تلقائي ولا يدوي — قرار بشري خارج هذا المسار.
   */
  | { outcome: "PHONE_CONFLICT"; organizationId: string };

/**
 * يحلّ المؤسسة من مرجعها العام.
 *
 * **الخادم وحده يحلّ الـ slug، ولا يقبل `organizationId` من الواجهة إطلاقًا.**
 * مرجعٌ غير معروف أو مؤسسة موقوفة يُردّان برسالة واحدة لا تفرّق بينهما.
 */
export async function resolveEnrollableOrganization(prisma: PrismaClient, organizationSlug: string) {
  const slug = organizationSlug.trim().toLowerCase();
  if (!slug) throw new BusinessError("الصالون غير متاح للتسجيل حاليًا", 404);

  const organization = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!organization || organization.status !== "ACTIVE") {
    throw new BusinessError("الصالون غير متاح للتسجيل حاليًا", 404);
  }
  return organization;
}

export async function enrollAccountInOrganization(
  prisma: PrismaClient,
  input: { accountId: string; organizationSlug: string },
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<EnrollmentResult> {
  const organization = await resolveEnrollableOrganization(prisma, input.organizationSlug);

  const account = await prisma.customerAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, name: true, phone: true, status: true, emailVerifiedAt: true },
  });
  if (!account || account.status !== "ACTIVE") throw new BusinessError("الحساب غير نشط", 403);
  // البريد الموثّق شرط الانضمام كما هو شرط الجلسة: لا عضوية باسم بريد لم يُثبت.
  if (!account.emailVerifiedAt) throw new BusinessError("فعّل بريدك قبل الانضمام", 403);

  // فحص استباقي للراحة؛ القيد في القاعدة هو الحكم النهائي أدناه.
  const existing = await prisma.customer.findFirst({
    where: { accountId: account.id, organizationId: organization.id },
    select: { id: true },
  });
  if (existing) {
    return { outcome: "ALREADY_ENROLLED", customerId: existing.id, organizationId: organization.id, reference: organization.slug };
  }

  // الشكل المحلي هو عقد سجلات المؤسسة (بحث الحلاق وواتساب والإيصالات).
  const localPhone = toSaudiLocalPhone(account.phone);

  // `@@unique([organizationId, phone])` قائم: سجل غير مرتبط بنفس الرقم يمنع
  // الإنشاء. نُبلغ عنه تعارضًا صريحًا بدل ابتلاعه أو ضمّه بلا إثبات.
  const phoneOwner = await prisma.customer.findFirst({
    where: { organizationId: organization.id, phone: localPhone },
    select: { id: true, accountId: true },
  });
  if (phoneOwner && phoneOwner.accountId !== account.id) {
    await writeAuditLog({
      prisma,
      organizationId: organization.id,
      actorType: "CUSTOMER",
      action: "customer_account.enrollment_phone_conflict",
      entityType: "Customer",
      entityId: phoneOwner.id,
      ...meta,
    });
    return { outcome: "PHONE_CONFLICT", organizationId: organization.id };
  }

  try {
    // `createCustomerWithLoyalty` ينشئ العميل وحساب ولائه في **إنشاء متداخل واحد
    // داخل معاملة `Serializable`** — فلا يوجد عميلٌ بلا حساب ولاء بفشل في المنتصف.
    const created = await createCustomerWithLoyalty({
      prisma,
      organizationId: organization.id,
      accountId: account.id,
      name: account.name,
      phone: localPhone,
      enrollInLoyalty: true,
      privacyNotice: {
        acknowledgedAt: new Date(),
        version: LEGAL_VERSION,
        controllerName: organization.name,
      },
    });

    await writeAuditLog({
      prisma,
      organizationId: organization.id,
      actorType: "CUSTOMER",
      action: "customer_account.enrolled",
      entityType: "Customer",
      entityId: created.customer.id,
      ...meta,
    });

    return {
      outcome: created.created ? "ENROLLED" : "ALREADY_ENROLLED",
      customerId: created.customer.id,
      organizationId: organization.id,
      reference: organization.slug,
    };
  } catch (error) {
    // خط الدفاع الأخير: طلبان متزامنان يمرّان بالفحص الاستباقي معًا، ويحسم
    // `UNIQUE(accountId, organizationId)` أيهما كتب. الخاسر يقرأ الفائز.
    if (isUniqueConflict(error)) {
      const settled = await prisma.customer.findFirst({
        where: { accountId: account.id, organizationId: organization.id },
        select: { id: true },
      });
      if (settled) {
        return { outcome: "ALREADY_ENROLLED", customerId: settled.id, organizationId: organization.id, reference: organization.slug };
      }
      return { outcome: "PHONE_CONFLICT", organizationId: organization.id };
    }
    throw error;
  }
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
