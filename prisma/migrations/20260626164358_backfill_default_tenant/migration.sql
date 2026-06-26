-- Backfill existing single-salon data into a default Organization + Salon.
-- Idempotent and safe to run on an empty database (updates 0 rows).

-- Default plan
INSERT INTO "Plan" ("id", "name", "slug", "priceMonthly", "maxSalons", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES ('plan_starter', 'البداية', 'starter', 0, 1, true, 0, now(), now())
ON CONFLICT ("id") DO NOTHING;

-- Default organization (inherits the existing salon name when available)
INSERT INTO "Organization" ("id", "name", "slug", "status", "planId", "subscriptionStatus", "createdAt", "updatedAt")
VALUES (
  'org_default',
  COALESCE((SELECT "salonName" FROM "SystemSettings" ORDER BY "createdAt" ASC LIMIT 1), 'مؤسسة افتراضية'),
  'default',
  'ACTIVE',
  'plan_starter',
  'ACTIVE',
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Default salon
INSERT INTO "Salon" ("id", "organizationId", "name", "slug", "isActive", "createdAt", "updatedAt")
VALUES (
  'salon_default',
  'org_default',
  COALESCE((SELECT "salonName" FROM "SystemSettings" ORDER BY "createdAt" ASC LIMIT 1), 'الصالون الرئيسي'),
  'main',
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Backfill organizationId on all tenant tables
UPDATE "User" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Barber" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Customer" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Service" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Visit" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "LoyaltyAccount" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "LoyaltyTransaction" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "RewardRule" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Campaign" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "CampaignRedemption" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "ManagerReward" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "DailyClose" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "CashSession" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "SystemSettings" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "WhatsAppTemplate" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "WhatsAppMessageLog" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "AuditLog" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;

-- Backfill salonId on salon-scoped tables
UPDATE "Barber" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "Service" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "Visit" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "DailyClose" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "CashSession" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "SystemSettings" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
