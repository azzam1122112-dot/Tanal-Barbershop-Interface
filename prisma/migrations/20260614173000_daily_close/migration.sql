CREATE TABLE "DailyClose" (
  "id" TEXT NOT NULL,
  "barberId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
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
  "cashReceivedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "receivedByUserId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyClose_barberId_date_key" ON "DailyClose"("barberId", "date");
CREATE INDEX "DailyClose_date_idx" ON "DailyClose"("date");
CREATE INDEX "DailyClose_receivedByUserId_idx" ON "DailyClose"("receivedByUserId");

ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
