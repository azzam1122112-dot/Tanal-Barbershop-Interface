import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { hashAdminPassword } from "@/lib/auth/password";
import { findUserIdentityConflicts, identityConflictMessage } from "@/lib/auth/user-identity";
import { getDefaultSignupPlan } from "@/lib/plans/subscription-service";
import { seedDefaultWhatsAppTemplates } from "@/lib/whatsapp/default-templates";

const TRIAL_DAYS = 14;

/** أساس معرّف من اسم لاتيني إن وُجد، وإلا "salon". */
function slugifyBase(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return base.length >= 2 ? base : "salon";
}

/** يولّد معرّفًا فريدًا تلقائيًا (asas-xxxx) دون تدخّل المستخدم. */
async function generateUniqueSlug(prisma: PrismaClient, preferred: string) {
  const base = slugifyBase(preferred);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 40);
    const existing = await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  return `salon-${Date.now().toString(36)}`;
}

function defaultSettings(organizationId: string, salonId: string, salonName: string) {
  return {
    organizationId,
    salonId,
    salonName,
    currency: "SAR",
    pointsPerCurrencyUnit: 1,
    pointsCalculatedAfterDiscount: true,
    allowMultipleDiscounts: false,
    whatsappDefaultCountryCode: "966",
    whatsappEnabled: true,
  };
}

/** تسجيل ذاتي: ينشئ مؤسسة + أول صالون + حساب المالك + إعدادات الصالون. */
export async function createOrganizationWithOwner(
  prisma: PrismaClient,
  input: {
    organizationName: string;
    slug?: string;
    salonName?: string;
    ownerName: string;
    email: string;
    phone: string;
    password: string;
  },
) {
  let slug = input.slug?.trim().toLowerCase();
  if (slug) {
    const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (existing) {
      throw new BusinessError("هذا المعرّف مستخدم مسبقًا، اختر معرّفًا آخر");
    }
  } else {
    slug = await generateUniqueSlug(prisma, input.organizationName);
  }

  const plan = await getDefaultSignupPlan(prisma);
  if (!plan) {
    throw new BusinessError("لا توجد باقة مجانية فعّالة حاليًا. فعّل باقة مجانية من لوحة المنصة أولًا.");
  }

  const passwordHash = await hashAdminPassword(input.password);
  const salonName = input.salonName?.trim() || "الصالون الرئيسي";

  return prisma.$transaction(async (tx) => {
    // حارس عالمي: لا يتكرر بريد المالك أو جواله عبر كل المؤسسات (التفرّد في القاعدة مقيّد بالمؤسسة فقط).
    const { emailTaken, phoneTaken } = await findUserIdentityConflicts(tx, { email: input.email, phone: input.phone });
    const conflictMessage = identityConflictMessage(emailTaken, phoneTaken);
    if (conflictMessage) throw new BusinessError(conflictMessage);

    const organization = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug,
        status: "ACTIVE",
        planId: plan.id,
        subscriptionStatus: "TRIALING",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    const salon = await tx.salon.create({
      data: { organizationId: organization.id, name: salonName, slug: "main", isActive: true },
    });

    const owner = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: input.ownerName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        role: "OWNER",
        isActive: true,
      },
    });

    await tx.systemSettings.create({ data: defaultSettings(organization.id, salon.id, salonName) });
    await seedDefaultWhatsAppTemplates(tx, organization.id);

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorType: "OWNER",
        actorUserId: owner.id,
        action: "organization.created",
        entityType: "Organization",
        entityId: organization.id,
        after: { slug: organization.slug, name: organization.name, salonId: salon.id },
      },
    });

    return { organization, salon, owner };
  });
}

export async function listSalons(prisma: PrismaClient, organizationId: string) {
  const salons = await prisma.salon.findMany({
    where: { organizationId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { barbers: true } } },
  });
  return salons.map((salon) => ({
    id: salon.id,
    name: salon.name,
    slug: salon.slug,
    isActive: salon.isActive,
    barbersCount: salon._count.barbers,
    createdAt: salon.createdAt.toISOString(),
  }));
}

export async function createSalon(
  prisma: PrismaClient,
  organizationId: string,
  input: { name: string; slug: string },
) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { plan: true, _count: { select: { salons: true } } },
  });
  if (!organization) throw new BusinessError("المؤسسة غير موجودة");

  const maxSalons = organization.plan?.maxSalons ?? 1;
  if (organization._count.salons >= maxSalons) {
    throw new BusinessError(`باقتك تسمح بـ ${maxSalons} صالون. رقّ باقتك لإضافة فروع أكثر.`);
  }

  const duplicate = await prisma.salon.findFirst({
    where: { organizationId, slug: input.slug },
    select: { id: true },
  });
  if (duplicate) throw new BusinessError("معرّف الصالون مستخدم مسبقًا داخل مؤسستك");

  return prisma.$transaction(async (tx) => {
    const salon = await tx.salon.create({
      data: { organizationId, name: input.name, slug: input.slug, isActive: true },
    });
    await tx.systemSettings.create({ data: defaultSettings(organizationId, salon.id, input.name) });
    return salon;
  });
}

export async function updateSalon(
  prisma: PrismaClient,
  organizationId: string,
  salonId: string,
  data: { name?: string; isActive?: boolean },
) {
  const salon = await prisma.salon.findFirst({ where: { id: salonId, organizationId }, select: { id: true } });
  if (!salon) throw new BusinessError("الصالون غير موجود");

  // إبقاء فرع نشط واحد على الأقل حتى لا تتعطّل المؤسسة بالكامل.
  if (data.isActive === false) {
    const otherActive = await prisma.salon.count({
      where: { organizationId, isActive: true, id: { not: salon.id } },
    });
    if (otherActive === 0) {
      throw new BusinessError("يجب بقاء فرع نشط واحد على الأقل في المؤسسة");
    }
  }

  return prisma.salon.update({ where: { id: salon.id }, data });
}

/**
 * حذف فرع نهائيًا. الحذف مسموح فقط للفرع الفارغ من أي تاريخ تشغيلي؛
 * غير ذلك يُقترح التعطيل حفاظًا على سلامة السجلات المالية والتدقيق.
 */
export async function deleteSalon(prisma: PrismaClient, organizationId: string, salonId: string) {
  const salon = await prisma.salon.findFirst({ where: { id: salonId, organizationId } });
  if (!salon) throw new BusinessError("الصالون غير موجود", 404);

  const totalSalons = await prisma.salon.count({ where: { organizationId } });
  if (totalSalons <= 1) {
    throw new BusinessError("لا يمكن حذف الفرع الوحيد في المؤسسة");
  }

  const [visits, cashSessions, dailyCloses, barbers, services] = await prisma.$transaction([
    prisma.visit.count({ where: { salonId } }),
    prisma.cashSession.count({ where: { salonId } }),
    prisma.dailyClose.count({ where: { salonId } }),
    prisma.barber.count({ where: { salonId } }),
    prisma.service.count({ where: { salonId } }),
  ]);

  if (visits + cashSessions + dailyCloses > 0) {
    throw new BusinessError(
      "لا يمكن حذف فرع له سجل تشغيلي (زيارات أو جلسات صندوق أو إغلاقات). عطّل الفرع بدل حذفه للحفاظ على تقاريره.",
      409,
    );
  }

  if (barbers > 0) {
    throw new BusinessError("انقل حلاقي هذا الفرع أو احذفهم قبل حذف الفرع", 409);
  }

  // مشرف بلا فروع مسندة يفقد وصوله كليًا — امنع الحذف حتى يُسند لفرع آخر.
  const assignedUserIds = (await prisma.staffSalon.findMany({ where: { salonId }, select: { userId: true } })).map(
    (row) => row.userId,
  );
  if (assignedUserIds.length > 0) {
    const stranded = await prisma.user.findMany({
      where: {
        id: { in: assignedUserIds },
        role: "SUPERVISOR",
        salonAssignments: { none: { salonId: { not: salonId } } },
      },
      select: { name: true },
    });
    if (stranded.length > 0) {
      throw new BusinessError(
        `هذا الفرع هو الوحيد المسند لـ ${stranded.map((user) => user.name).join("، ")}. أسندهم لفرع آخر أولًا.`,
        409,
      );
    }
  }

  // الفرع فارغ: نحذف إعداداته وخدماته المرتبطة ثم الفرع نفسه.
  await prisma.$transaction(async (tx) => {
    await tx.staffSalon.deleteMany({ where: { salonId } });
    await tx.systemSettings.deleteMany({ where: { salonId } });
    if (services > 0) await tx.service.deleteMany({ where: { salonId } });
    await tx.salon.delete({ where: { id: salonId } });
  });

  return { id: salon.id, name: salon.name, slug: salon.slug };
}
