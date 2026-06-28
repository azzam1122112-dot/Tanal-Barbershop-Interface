import { PrismaClient } from "@prisma/client";
import { hashAdminPassword } from "../lib/auth/password";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { normalizeSaudiPhone } from "../lib/phone/saudi-phone";
import { DEFAULT_WHATSAPP_TEMPLATES } from "../lib/whatsapp/default-templates";

const prisma = new PrismaClient();

const requireExplicitSeedCredentials = process.env.REQUIRE_EXPLICIT_SEED_CREDENTIALS === "true";

// معرّفات ثابتة تطابق هجرة الترحيل backfill_default_tenant.
const DEFAULT_PLAN_ID = "plan_starter";
const DEFAULT_ORG_ID = "org_default";
const DEFAULT_SALON_ID = "salon_default";

function readSeedEnv(key: string, fallback: string) {
  const value = process.env[key];

  if (requireExplicitSeedCredentials && !value) {
    throw new Error(`${key} is required when REQUIRE_EXPLICIT_SEED_CREDENTIALS=true`);
  }

  return value ?? fallback;
}

function normalizeSeedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^9665\d{8}$/.test(digits)) {
    return normalizeSaudiPhone(`0${digits.slice(3)}`);
  }

  return normalizeSaudiPhone(value);
}

async function main() {
  const adminPhone = normalizeSeedPhone(readSeedEnv("SEED_ADMIN_PHONE", "0500000001"));
  const adminEmail = readSeedEnv("SEED_ADMIN_EMAIL", "admin@tanal.local");
  const adminPassword = readSeedEnv("SEED_ADMIN_PASSWORD", "Admin@12345");
  const barberPhone = normalizeSeedPhone(readSeedEnv("SEED_BARBER_PHONE", "0500000002"));
  const barberPin = readSeedEnv("SEED_BARBER_PIN", "Tanal@123");

  // الباقة الافتراضية
  await prisma.plan.upsert({
    where: { id: DEFAULT_PLAN_ID },
    update: {},
    create: {
      id: DEFAULT_PLAN_ID,
      name: "البداية",
      slug: "starter",
      priceMonthly: 0,
      maxSalons: 1,
      isActive: true,
      sortOrder: 0,
    },
  });

  // المؤسسة الافتراضية + الصالون الافتراضي
  const organization = await prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      name: "صالون تانال",
      slug: "default",
      status: "ACTIVE",
      planId: DEFAULT_PLAN_ID,
      subscriptionStatus: "ACTIVE",
    },
  });

  const salon = await prisma.salon.upsert({
    where: { id: DEFAULT_SALON_ID },
    update: {},
    create: {
      id: DEFAULT_SALON_ID,
      organizationId: organization.id,
      name: "الصالون الرئيسي",
      slug: "main",
      isActive: true,
    },
  });

  const admin = await prisma.user.upsert({
    where: { organizationId_phone: { organizationId: organization.id, phone: adminPhone } },
    update: {
      name: "مدير النظام",
      email: adminEmail,
      passwordHash: await hashAdminPassword(adminPassword),
      role: "ADMIN",
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      name: "مدير النظام",
      email: adminEmail,
      phone: adminPhone,
      passwordHash: await hashAdminPassword(adminPassword),
      role: "ADMIN",
      isActive: true,
    },
  });

  const barber = await prisma.barber.upsert({
    where: { organizationId_phone: { organizationId: organization.id, phone: barberPhone } },
    update: {
      name: "حلاق تجريبي",
      accessPinHash: await hashBarberPin(barberPin),
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      salonId: salon.id,
      name: "حلاق تجريبي",
      phone: barberPhone,
      accessPinHash: await hashBarberPin(barberPin),
      isActive: true,
    },
  });

  await prisma.systemSettings.upsert({
    where: { salonId: salon.id },
    update: {
      salonName: "صالون تانال",
      currency: "SAR",
      pointsPerCurrencyUnit: 1,
      pointsCalculatedAfterDiscount: true,
      allowMultipleDiscounts: false,
      whatsappDefaultCountryCode: "966",
      whatsappEnabled: true,
    },
    create: {
      organizationId: organization.id,
      salonId: salon.id,
      salonName: "صالون تانال",
      currency: "SAR",
      pointsPerCurrencyUnit: 1,
      pointsCalculatedAfterDiscount: true,
      allowMultipleDiscounts: false,
      whatsappDefaultCountryCode: "966",
      whatsappEnabled: true,
    },
  });

  await prisma.rewardRule.createMany({
    data: [
      { organizationId: organization.id, name: "خصم 25 ريال", requiredPoints: 500, discountAmount: 25, sortOrder: 1 },
      { organizationId: organization.id, name: "خصم 60 ريال", requiredPoints: 1000, discountAmount: 60, sortOrder: 2 },
    ],
    skipDuplicates: true,
  });

  await prisma.service.createMany({
    data: [
      { organizationId: organization.id, salonId: salon.id, name: "حلاقة شعر", defaultPrice: 35, sortOrder: 1 },
      { organizationId: organization.id, salonId: salon.id, name: "تهذيب لحية", defaultPrice: 20, sortOrder: 2 },
      { organizationId: organization.id, salonId: salon.id, name: "حلاقة شعر ولحية", defaultPrice: 50, sortOrder: 3 },
      { organizationId: organization.id, salonId: salon.id, name: "تنظيف بشرة", defaultPrice: 80, sortOrder: 4 },
    ],
    skipDuplicates: true,
  });

  for (const template of DEFAULT_WHATSAPP_TEMPLATES) {
    const existing = await prisma.whatsAppTemplate.findFirst({
      where: { organizationId: organization.id, type: template.type, name: template.name },
    });
    if (existing) {
      await prisma.whatsAppTemplate.update({ where: { id: existing.id }, data: { body: template.body, isActive: true } });
    } else {
      await prisma.whatsAppTemplate.create({ data: { ...template, organizationId: organization.id } });
    }
  }

  const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL ?? adminEmail;
  const platformAdminPassword = process.env.PLATFORM_ADMIN_PASSWORD ?? adminPassword;
  await prisma.platformAdmin.upsert({
    where: { email: platformAdminEmail },
    update: { isActive: true },
    create: {
      name: "مدير المنصّة",
      email: platformAdminEmail,
      passwordHash: await hashAdminPassword(platformAdminPassword),
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorType: "SYSTEM",
      action: "seed.initialized",
      entityType: "System",
      after: {
        organizationId: organization.id,
        salonId: salon.id,
        adminId: admin.id,
        barberId: barber.id,
        phase: 1,
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
