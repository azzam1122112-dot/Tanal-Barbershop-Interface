-- Security hardening: platform MFA, expiring hashed portal tokens, mandatory tenant ids,
-- and database-enforced composite tenant relationships.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "PlatformAdmin"
  ADD COLUMN "mfaEnabledAt" TIMESTAMP(3),
  ADD COLUMN "mfaSecretCiphertext" TEXT,
  ADD COLUMN "mfaPendingCiphertext" TEXT,
  ADD COLUMN "mfaRecoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mfaLastUsedStep" BIGINT;

ALTER TABLE "Session"
  ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "mfaSetupOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PlatformMfaChallenge" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "platformAdminId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformMfaChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformMfaChallenge_platformAdminId_fkey"
    FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PlatformMfaChallenge_tokenHash_key" ON "PlatformMfaChallenge"("tokenHash");
CREATE INDEX "PlatformMfaChallenge_platformAdminId_expiresAt_idx" ON "PlatformMfaChallenge"("platformAdminId", "expiresAt");
CREATE INDEX "PlatformMfaChallenge_expiresAt_consumedAt_idx" ON "PlatformMfaChallenge"("expiresAt", "consumedAt");

ALTER TABLE "Customer"
  ADD COLUMN "portalTokenHash" TEXT,
  ADD COLUMN "portalTokenIssuedAt" TIMESTAMP(3),
  ADD COLUMN "portalTokenExpiresAt" TIMESTAMP(3);
UPDATE "Customer"
SET "portalTokenHash" = encode(digest("portalToken", 'sha256'), 'hex'),
    "portalTokenIssuedAt" = CURRENT_TIMESTAMP,
    "portalTokenExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE "portalToken" IS NOT NULL;
CREATE UNIQUE INDEX "Customer_portalTokenHash_key" ON "Customer"("portalTokenHash");
DROP INDEX IF EXISTS "Customer_portalToken_key";
ALTER TABLE "Customer" DROP COLUMN "portalToken";

-- Backfill legacy nullable tenant columns from their authoritative parent.
UPDATE "User" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Barber" b SET "organizationId" = COALESCE(s."organizationId", 'org_default')
  FROM "Salon" s WHERE b."salonId" = s."id" AND b."organizationId" IS NULL;
UPDATE "Barber" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Barber" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "Customer" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Service" s SET "organizationId" = COALESCE(sa."organizationId", 'org_default')
  FROM "Salon" sa WHERE s."salonId" = sa."id" AND s."organizationId" IS NULL;
UPDATE "Service" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Service" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "Visit" v SET "organizationId" = c."organizationId" FROM "Customer" c
  WHERE v."customerId" = c."id" AND v."organizationId" IS NULL;
UPDATE "Visit" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Visit" SET "salonId" = 'salon_default' WHERE "salonId" IS NULL;
UPDATE "LoyaltyAccount" l SET "organizationId" = c."organizationId" FROM "Customer" c
  WHERE l."customerId" = c."id" AND l."organizationId" IS NULL;
UPDATE "LoyaltyTransaction" l SET "organizationId" = c."organizationId" FROM "Customer" c
  WHERE l."customerId" = c."id" AND l."organizationId" IS NULL;
UPDATE "RewardRule" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "Campaign" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "CampaignRedemption" r SET "organizationId" = c."organizationId" FROM "Campaign" c
  WHERE r."campaignId" = c."id" AND r."organizationId" IS NULL;
UPDATE "ManagerReward" r SET "organizationId" = c."organizationId" FROM "Customer" c
  WHERE r."customerId" = c."id" AND r."organizationId" IS NULL;
UPDATE "DailyClose" d SET "organizationId" = b."organizationId", "salonId" = b."salonId" FROM "Barber" b
  WHERE d."barberId" = b."id" AND (d."organizationId" IS NULL OR d."salonId" IS NULL);
UPDATE "CashSession" c SET "organizationId" = b."organizationId", "salonId" = b."salonId" FROM "Barber" b
  WHERE c."barberId" = b."id" AND (c."organizationId" IS NULL OR c."salonId" IS NULL);
UPDATE "SystemSettings" s SET "organizationId" = COALESCE(sa."organizationId", 'org_default')
  FROM "Salon" sa WHERE s."salonId" = sa."id" AND s."organizationId" IS NULL;
UPDATE "SystemSettings" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "WhatsAppTemplate" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;
UPDATE "WhatsAppMessageLog" w SET "organizationId" = c."organizationId" FROM "Customer" c
  WHERE w."customerId" = c."id" AND w."organizationId" IS NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "Barber" WHERE "organizationId" IS NULL OR "salonId" IS NULL UNION ALL
    SELECT 1 FROM "Customer" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "Service" WHERE "organizationId" IS NULL OR "salonId" IS NULL UNION ALL
    SELECT 1 FROM "Visit" WHERE "organizationId" IS NULL OR "salonId" IS NULL UNION ALL
    SELECT 1 FROM "LoyaltyAccount" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "LoyaltyTransaction" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "RewardRule" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "Campaign" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "CampaignRedemption" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "ManagerReward" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "DailyClose" WHERE "organizationId" IS NULL OR "salonId" IS NULL UNION ALL
    SELECT 1 FROM "CashSession" WHERE "organizationId" IS NULL OR "salonId" IS NULL UNION ALL
    SELECT 1 FROM "SystemSettings" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "WhatsAppTemplate" WHERE "organizationId" IS NULL UNION ALL
    SELECT 1 FROM "WhatsAppMessageLog" WHERE "organizationId" IS NULL
  ) THEN RAISE EXCEPTION 'Tenant hardening aborted: unresolved null tenant data'; END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Barber" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "Visit" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "LoyaltyAccount" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "LoyaltyTransaction" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "RewardRule" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CampaignRedemption" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ManagerReward" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "DailyClose" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "CashSession" ALTER COLUMN "organizationId" SET NOT NULL, ALTER COLUMN "salonId" SET NOT NULL;
ALTER TABLE "SystemSettings" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "WhatsAppTemplate" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "WhatsAppMessageLog" ALTER COLUMN "organizationId" SET NOT NULL;

-- Referenced composite keys.
CREATE UNIQUE INDEX "Salon_id_organizationId_key" ON "Salon"("id", "organizationId");
CREATE UNIQUE INDEX "User_id_organizationId_key" ON "User"("id", "organizationId");
CREATE UNIQUE INDEX "Barber_id_organizationId_key" ON "Barber"("id", "organizationId");
CREATE UNIQUE INDEX "Customer_id_organizationId_key" ON "Customer"("id", "organizationId");
CREATE UNIQUE INDEX "Service_id_organizationId_key" ON "Service"("id", "organizationId");
CREATE UNIQUE INDEX "Visit_id_organizationId_key" ON "Visit"("id", "organizationId");
CREATE UNIQUE INDEX "Campaign_id_organizationId_key" ON "Campaign"("id", "organizationId");
CREATE UNIQUE INDEX "CashSession_id_organizationId_key" ON "CashSession"("id", "organizationId");
CREATE UNIQUE INDEX "WhatsAppTemplate_id_organizationId_key" ON "WhatsAppTemplate"("id", "organizationId");
CREATE UNIQUE INDEX "Product_id_organizationId_key" ON "Product"("id", "organizationId");
CREATE UNIQUE INDEX "Session_id_organizationId_key" ON "Session"("id", "organizationId");

-- Core composite tenant foreign keys. Existing single-column FKs retain delete behavior;
-- these constraints independently reject cross-tenant references.
ALTER TABLE "StaffSalon" ADD CONSTRAINT "StaffSalon_user_tenant_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "StaffSalon" ADD CONSTRAINT "StaffSalon_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "Service" ADD CONSTRAINT "Service_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_customer_tenant_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") NOT VALID;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_cash_session_tenant_fkey" FOREIGN KEY ("cashSessionId", "organizationId") REFERENCES "CashSession"("id", "organizationId") NOT VALID;
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_customer_tenant_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") NOT VALID;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customer_tenant_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") NOT VALID;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_visit_tenant_fkey" FOREIGN KEY ("visitId", "organizationId") REFERENCES "Visit"("id", "organizationId") NOT VALID;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_campaign_tenant_fkey" FOREIGN KEY ("campaignId", "organizationId") REFERENCES "Campaign"("id", "organizationId") NOT VALID;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_customer_tenant_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") NOT VALID;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_visit_tenant_fkey" FOREIGN KEY ("visitId", "organizationId") REFERENCES "Visit"("id", "organizationId") NOT VALID;
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_receiver_tenant_fkey" FOREIGN KEY ("receivedByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_customer_tenant_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") NOT VALID;
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_template_tenant_fkey" FOREIGN KEY ("templateId", "organizationId") REFERENCES "WhatsAppTemplate"("id", "organizationId") NOT VALID;
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_campaign_tenant_fkey" FOREIGN KEY ("campaignId", "organizationId") REFERENCES "Campaign"("id", "organizationId") NOT VALID;
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_visit_tenant_fkey" FOREIGN KEY ("visitId", "organizationId") REFERENCES "Visit"("id", "organizationId") NOT VALID;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_cash_session_tenant_fkey" FOREIGN KEY ("cashSessionId", "organizationId") REFERENCES "CashSession"("id", "organizationId") NOT VALID;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customer_tenant_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") NOT VALID;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_visit_tenant_fkey" FOREIGN KEY ("visitId", "organizationId") REFERENCES "Visit"("id", "organizationId") NOT VALID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_product_tenant_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_visit_tenant_fkey" FOREIGN KEY ("visitId", "organizationId") REFERENCES "Visit"("id", "organizationId") NOT VALID;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "Attendance_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "Attendance_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "BarberPushSubscription" ADD CONSTRAINT "Push_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "BarberPushSubscription" ADD CONSTRAINT "Push_session_tenant_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "Session"("id", "organizationId") NOT VALID;

-- Visit line tables do not duplicate organizationId, so constraint triggers compare their parents.
CREATE FUNCTION enforce_visit_service_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "organizationId" FROM "Visit" WHERE "id" = NEW."visitId") IS DISTINCT FROM
     (SELECT "organizationId" FROM "Service" WHERE "id" = NEW."serviceId")
  THEN RAISE EXCEPTION 'cross-tenant VisitService relation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "VisitService_tenant_guard" BEFORE INSERT OR UPDATE ON "VisitService"
  FOR EACH ROW EXECUTE FUNCTION enforce_visit_service_tenant();

CREATE FUNCTION enforce_visit_product_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "organizationId" FROM "Visit" WHERE "id" = NEW."visitId") IS DISTINCT FROM
     (SELECT "organizationId" FROM "Product" WHERE "id" = NEW."productId")
  THEN RAISE EXCEPTION 'cross-tenant VisitProduct relation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "VisitProduct_tenant_guard" BEFORE INSERT OR UPDATE ON "VisitProduct"
  FOR EACH ROW EXECUTE FUNCTION enforce_visit_product_tenant();

-- Validate all added constraints now: migration fails closed if legacy rows are inconsistent.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
           WHERE conname LIKE '%_tenant_fkey' AND NOT convalidated
  LOOP EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tbl, c.conname); END LOOP;
END $$;
