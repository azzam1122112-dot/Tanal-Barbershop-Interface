-- CreateEnum
CREATE TYPE "WhatsAppMessageCategory" AS ENUM ('TRANSACTIONAL', 'MARKETING', 'SERVICE');

-- CreateEnum
CREATE TYPE "WhatsAppConsentSource" AS ENUM ('IN_PERSON', 'WEBSITE', 'WHATSAPP', 'PHONE', 'IMPORTED', 'OTHER');

-- CreateEnum
CREATE TYPE "WhatsAppSafetyMode" AS ENUM ('STRICT', 'BALANCED', 'CUSTOM');

-- AlterTable
ALTER TABLE "Customer"
  ALTER COLUMN "whatsappOptIn" SET DEFAULT false,
  ADD COLUMN "whatsappTransactionalOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappMarketingOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappConsentSource" "WhatsAppConsentSource",
  ADD COLUMN "whatsappTransactionalConsentAt" TIMESTAMP(3),
  ADD COLUMN "whatsappMarketingConsentAt" TIMESTAMP(3),
  ADD COLUMN "whatsappOptOutAt" TIMESTAMP(3),
  ADD COLUMN "whatsappOptOutReason" TEXT,
  ADD COLUMN "whatsappLastContactedAt" TIMESTAMP(3),
  ADD COLUMN "whatsappLastMarketingAt" TIMESTAMP(3);

-- نحافظ على الموافقة القديمة لرسائل الخدمة فقط؛ التسويق يحتاج موافقة صريحة جديدة.
UPDATE "Customer"
SET
  "whatsappTransactionalOptIn" = "whatsappOptIn",
  "whatsappTransactionalConsentAt" = CASE WHEN "whatsappOptIn" THEN "updatedAt" ELSE NULL END,
  "whatsappConsentSource" = CASE WHEN "whatsappOptIn" THEN 'IMPORTED'::"WhatsAppConsentSource" ELSE NULL END;

-- AlterTable
ALTER TABLE "WhatsAppMessageLog"
  ADD COLUMN "category" "WhatsAppMessageCategory" NOT NULL DEFAULT 'SERVICE',
  ADD COLUMN "policySnapshot" JSONB;

-- CreateTable
CREATE TABLE "WhatsAppSafetySettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "mode" "WhatsAppSafetyMode" NOT NULL DEFAULT 'STRICT',
  "marketingCooldownHours" INTEGER NOT NULL DEFAULT 168,
  "maxMarketingPerCustomer30Days" INTEGER NOT NULL DEFAULT 4,
  "maxMessagesPerCustomer24Hours" INTEGER NOT NULL DEFAULT 2,
  "dailyOrganizationDraftLimit" INTEGER NOT NULL DEFAULT 100,
  "appendOptOutInstructions" BOOLEAN NOT NULL DEFAULT true,
  "optOutText" TEXT NOT NULL DEFAULT 'لإيقاف العروض اكتب إيقاف',
  "marketingPaused" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppSafetySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_organizationId_whatsappMarketingOptIn_idx" ON "Customer"("organizationId", "whatsappMarketingOptIn");
CREATE INDEX "Customer_organizationId_whatsappLastMarketingAt_idx" ON "Customer"("organizationId", "whatsappLastMarketingAt");
CREATE INDEX "WhatsAppMessageLog_organizationId_category_createdAt_idx" ON "WhatsAppMessageLog"("organizationId", "category", "createdAt");
CREATE UNIQUE INDEX "WhatsAppSafetySettings_organizationId_key" ON "WhatsAppSafetySettings"("organizationId");
CREATE INDEX "WhatsAppSafetySettings_mode_idx" ON "WhatsAppSafetySettings"("mode");

-- AddForeignKey
ALTER TABLE "WhatsAppSafetySettings" ADD CONSTRAINT "WhatsAppSafetySettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
