import { PrismaClient } from "@prisma/client";
import { hashAdminPassword } from "../lib/auth/password";
import { hashBarberPin } from "../lib/auth/barber-pin";

const prisma = new PrismaClient();

const requireExplicitSeedCredentials = process.env.REQUIRE_EXPLICIT_SEED_CREDENTIALS === "true";

function readSeedEnv(key: string, fallback: string) {
  const value = process.env[key];

  if (requireExplicitSeedCredentials && !value) {
    throw new Error(`${key} is required when REQUIRE_EXPLICIT_SEED_CREDENTIALS=true`);
  }

  return value ?? fallback;
}

async function main() {
  const adminPhone = readSeedEnv("SEED_ADMIN_PHONE", "966500000001");
  const adminEmail = readSeedEnv("SEED_ADMIN_EMAIL", "admin@tanal.local");
  const adminPassword = readSeedEnv("SEED_ADMIN_PASSWORD", "Admin@12345");
  const barberPhone = readSeedEnv("SEED_BARBER_PHONE", "966500000002");
  const barberPin = readSeedEnv("SEED_BARBER_PIN", "1234");

  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {
      name: "مدير النظام",
      email: adminEmail,
      passwordHash: await hashAdminPassword(adminPassword),
      role: "ADMIN",
      isActive: true,
    },
    create: {
      name: "مدير النظام",
      email: adminEmail,
      phone: adminPhone,
      passwordHash: await hashAdminPassword(adminPassword),
      role: "ADMIN",
      isActive: true,
    },
  });

  const barber = await prisma.barber.upsert({
    where: { phone: barberPhone },
    update: {
      name: "حلاق تجريبي",
      accessPinHash: await hashBarberPin(barberPin),
      isActive: true,
    },
    create: {
      name: "حلاق تجريبي",
      phone: barberPhone,
      accessPinHash: await hashBarberPin(barberPin),
      isActive: true,
    },
  });

  await prisma.systemSettings.upsert({
    where: { singletonKey: "default" },
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
      {
        name: "خصم 25 ريال",
        requiredPoints: 500,
        discountAmount: 25,
        sortOrder: 1,
      },
      {
        name: "خصم 60 ريال",
        requiredPoints: 1000,
        discountAmount: 60,
        sortOrder: 2,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.service.createMany({
    data: [
      { name: "حلاقة شعر", defaultPrice: 35, sortOrder: 1 },
      { name: "تهذيب لحية", defaultPrice: 20, sortOrder: 2 },
      { name: "حلاقة شعر ولحية", defaultPrice: 50, sortOrder: 3 },
      { name: "تنظيف بشرة", defaultPrice: 80, sortOrder: 4 },
    ],
    skipDuplicates: true,
  });

  const whatsappTemplates = [
    {
      name: "رسالة بعد الزيارة",
      type: "POST_VISIT" as const,
      body: `أهلًا {name} 👋
تم تسجيل زيارتك في {salon_name}.
المبلغ المدفوع: {visit_net_amount} ريال
النقاط المكتسبة: {visit_points_earned}
رصيدك الحالي: {points} نقطة
شكرًا لزيارتك.`,
    },
    {
      name: "مكافأة جاهزة",
      type: "REWARD_READY" as const,
      body: `أهلًا {name} 👋
لديك مكافأة جاهزة في {salon_name}.
خصم {reward_discount} ريال متاح في زيارتك القادمة.
رصيدك الحالي: {points} نقطة`,
    },
    {
      name: "عميل منقطع",
      type: "INACTIVE_CUSTOMER" as const,
      body: `أهلًا {name} 👋
اشتقنا لك في {salon_name}.
مرّ {days_since_last_visit} يوم على آخر زيارة لك.
نسعد بزيارتك قريبًا.`,
    },
    {
      name: "رسالة حملة",
      type: "CAMPAIGN" as const,
      body: `أهلًا {name} 👋
عرض خاص من {salon_name}: {campaign_name}
خصم {campaign_discount}
العرض لفترة محدودة.`,
    },
  ];

  for (const template of whatsappTemplates) {
    const existing = await prisma.whatsAppTemplate.findFirst({ where: { type: template.type, name: template.name } });
    if (existing) {
      await prisma.whatsAppTemplate.update({ where: { id: existing.id }, data: { body: template.body, isActive: true } });
    } else {
      await prisma.whatsAppTemplate.create({ data: template });
    }
  }

  await prisma.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action: "seed.initialized",
      entityType: "System",
      after: {
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
