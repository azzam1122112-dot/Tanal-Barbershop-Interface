CREATE TYPE "CampaignDiscountType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');
CREATE TYPE "CampaignTargetType" AS ENUM ('ALL_CUSTOMERS', 'NEW_CUSTOMERS', 'INACTIVE_CUSTOMERS', 'CUSTOMERS_WITH_MIN_POINTS');

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "discountType" "CampaignDiscountType" NOT NULL,
  "discountValue" DECIMAL(10,2) NOT NULL,
  "targetType" "CampaignTargetType" NOT NULL,
  "inactiveDays" INTEGER,
  "minPoints" INTEGER,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "maxUsesPerCustomer" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignRedemption" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "visitId" TEXT NOT NULL,
  "discountAmount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignRedemption_visitId_key" ON "CampaignRedemption"("visitId");
CREATE INDEX "Campaign_isActive_startAt_endAt_idx" ON "Campaign"("isActive", "startAt", "endAt");
CREATE INDEX "Campaign_targetType_idx" ON "Campaign"("targetType");
CREATE INDEX "CampaignRedemption_campaignId_customerId_idx" ON "CampaignRedemption"("campaignId", "customerId");
CREATE INDEX "CampaignRedemption_customerId_createdAt_idx" ON "CampaignRedemption"("customerId", "createdAt");

ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignRedemption" ADD CONSTRAINT "CampaignRedemption_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
