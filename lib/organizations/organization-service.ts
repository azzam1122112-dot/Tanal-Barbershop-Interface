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
  return prisma.salon.update({ where: { id: salon.id }, data });
}
