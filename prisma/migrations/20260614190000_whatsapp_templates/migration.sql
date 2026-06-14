-- CreateEnum
CREATE TYPE "WhatsAppTemplateType" AS ENUM ('POST_VISIT', 'REWARD_READY', 'CAMPAIGN', 'INACTIVE_CUSTOMER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('DRAFTED', 'OPENED', 'MARKED_SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WhatsAppTemplateType" NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessageLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "templateId" TEXT,
    "campaignId" TEXT,
    "visitId" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "waUrl" TEXT NOT NULL,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'DRAFTED',
    "openedByUserId" TEXT,
    "openedAt" TIMESTAMP(3),
    "markedSentByUserId" TEXT,
    "markedSentAt" TIMESTAMP(3),
    "skippedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_type_isActive_idx" ON "WhatsAppTemplate"("type", "isActive");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_customerId_createdAt_idx" ON "WhatsAppMessageLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_templateId_idx" ON "WhatsAppMessageLog"("templateId");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_campaignId_idx" ON "WhatsAppMessageLog"("campaignId");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_visitId_idx" ON "WhatsAppMessageLog"("visitId");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_status_createdAt_idx" ON "WhatsAppMessageLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_openedByUserId_idx" ON "WhatsAppMessageLog"("openedByUserId");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_markedSentByUserId_idx" ON "WhatsAppMessageLog"("markedSentByUserId");

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_markedSentByUserId_fkey" FOREIGN KEY ("markedSentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
