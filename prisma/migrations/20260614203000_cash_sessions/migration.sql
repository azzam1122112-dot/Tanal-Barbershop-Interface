CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "CashSession" (
  "id" TEXT NOT NULL,
  "barberId" TEXT NOT NULL,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "closedByUserId" TEXT,
  "visitsCount" INTEGER NOT NULL DEFAULT 0,
  "grossTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cashTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cardTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pointsEarnedTotal" INTEGER NOT NULL DEFAULT 0,
  "pointsRedeemedTotal" INTEGER NOT NULL DEFAULT 0,
  "rewardRedemptionsCount" INTEGER NOT NULL DEFAULT 0,
  "campaignRedemptionsCount" INTEGER NOT NULL DEFAULT 0,
  "cashReceivedAmount" DECIMAL(12,2),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Visit" ADD COLUMN "cashSessionId" TEXT;

CREATE INDEX "CashSession_barberId_status_idx" ON "CashSession"("barberId", "status");
CREATE INDEX "CashSession_openedAt_idx" ON "CashSession"("openedAt");
CREATE INDEX "CashSession_closedAt_idx" ON "CashSession"("closedAt");
CREATE INDEX "CashSession_closedByUserId_idx" ON "CashSession"("closedByUserId");
CREATE UNIQUE INDEX "CashSession_one_open_per_barber_idx" ON "CashSession"("barberId") WHERE "status" = 'OPEN';
CREATE INDEX "Visit_cashSessionId_idx" ON "Visit"("cashSessionId");

ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
