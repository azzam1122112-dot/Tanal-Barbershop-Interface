-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditActorType" ADD VALUE 'PLATFORM_ADMIN';
ALTER TYPE "AuditActorType" ADD VALUE 'OWNER';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'OWNER';

-- DropIndex
DROP INDEX "Barber_isActive_idx";

-- DropIndex
DROP INDEX "Barber_phone_key";

-- DropIndex
DROP INDEX "Campaign_isActive_startAt_endAt_idx";

-- DropIndex
DROP INDEX "Customer_lastVisitAt_idx";

-- DropIndex
DROP INDEX "Customer_phone_key";

-- DropIndex
DROP INDEX "Customer_whatsappOptIn_idx";

-- DropIndex
DROP INDEX "LoyaltyAccount_points_idx";

-- DropIndex
DROP INDEX "RewardRule_isActive_requiredPoints_idx";

-- DropIndex
DROP INDEX "RewardRule_name_key";

-- DropIndex
DROP INDEX "RewardRule_requiredPoints_key";

-- DropIndex
DROP INDEX "Service_isActive_sortOrder_idx";

-- DropIndex
DROP INDEX "Service_name_key";

-- DropIndex
DROP INDEX "SystemSettings_singletonKey_key";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "User_phone_key";

-- DropIndex
DROP INDEX "User_role_isActive_idx";

-- DropIndex
DROP INDEX "WhatsAppTemplate_type_isActive_idx";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "salonId" TEXT;

-- AlterTable
ALTER TABLE "Barber" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "salonId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CampaignRedemption" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "salonId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "DailyClose" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "salonId" TEXT;

-- AlterTable
ALTER TABLE "LoyaltyAccount" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "LoyaltyTransaction" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "ManagerReward" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "RewardRule" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "salonId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "activeSalonId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "salonId" TEXT,
ALTER COLUMN "singletonKey" DROP NOT NULL,
ALTER COLUMN "singletonKey" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "salonId" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppMessageLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "WhatsAppTemplate" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxSalons" INTEGER NOT NULL DEFAULT 1,
    "maxBarbers" INTEGER,
    "maxCustomers" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "planId" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Salon" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Salon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_isActive_sortOrder_idx" ON "Plan"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "Organization_planId_idx" ON "Organization"("planId");

-- CreateIndex
CREATE INDEX "Salon_organizationId_isActive_idx" ON "Salon"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Salon_organizationId_slug_key" ON "Salon"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Barber_salonId_isActive_idx" ON "Barber"("salonId", "isActive");

-- CreateIndex
CREATE INDEX "Barber_organizationId_idx" ON "Barber"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Barber_salonId_phone_key" ON "Barber"("salonId", "phone");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_isActive_startAt_endAt_idx" ON "Campaign"("organizationId", "isActive", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "CampaignRedemption_organizationId_idx" ON "CampaignRedemption"("organizationId");

-- CreateIndex
CREATE INDEX "CashSession_organizationId_status_idx" ON "CashSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CashSession_salonId_status_idx" ON "CashSession"("salonId", "status");

-- CreateIndex
CREATE INDEX "Customer_organizationId_lastVisitAt_idx" ON "Customer"("organizationId", "lastVisitAt");

-- CreateIndex
CREATE INDEX "Customer_organizationId_whatsappOptIn_idx" ON "Customer"("organizationId", "whatsappOptIn");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_phone_key" ON "Customer"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "DailyClose_organizationId_date_idx" ON "DailyClose"("organizationId", "date");

-- CreateIndex
CREATE INDEX "DailyClose_salonId_date_idx" ON "DailyClose"("salonId", "date");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_organizationId_points_idx" ON "LoyaltyAccount"("organizationId", "points");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_organizationId_idx" ON "LoyaltyTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "ManagerReward_organizationId_idx" ON "ManagerReward"("organizationId");

-- CreateIndex
CREATE INDEX "RewardRule_organizationId_isActive_requiredPoints_idx" ON "RewardRule"("organizationId", "isActive", "requiredPoints");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRule_organizationId_name_key" ON "RewardRule"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRule_organizationId_requiredPoints_key" ON "RewardRule"("organizationId", "requiredPoints");

-- CreateIndex
CREATE INDEX "Service_salonId_isActive_sortOrder_idx" ON "Service"("salonId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Service_organizationId_idx" ON "Service"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_salonId_name_key" ON "Service"("salonId", "name");

-- CreateIndex
CREATE INDEX "Session_organizationId_idx" ON "Session"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_salonId_key" ON "SystemSettings"("salonId");

-- CreateIndex
CREATE INDEX "SystemSettings_organizationId_idx" ON "SystemSettings"("organizationId");

-- CreateIndex
CREATE INDEX "User_organizationId_role_isActive_idx" ON "User"("organizationId", "role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_phone_key" ON "User"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Visit_organizationId_visitedAt_idx" ON "Visit"("organizationId", "visitedAt");

-- CreateIndex
CREATE INDEX "Visit_salonId_visitedAt_idx" ON "Visit"("salonId", "visitedAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_organizationId_idx" ON "WhatsAppMessageLog"("organizationId");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_organizationId_type_isActive_idx" ON "WhatsAppTemplate"("organizationId", "type", "isActive");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Salon" ADD CONSTRAINT "Salon_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_activeSalonId_fkey" FOREIGN KEY ("activeSalonId") REFERENCES "Salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRule" ADD CONSTRAINT "RewardRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReward" ADD CONSTRAINT "ManagerReward_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

