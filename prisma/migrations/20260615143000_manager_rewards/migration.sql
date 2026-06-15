-- AlterEnum
ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'MANAGER_REWARD';

-- CreateTable
CREATE TABLE "ManagerReward" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "redeemedVisitId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagerReward_redeemedVisitId_key" ON "ManagerReward"("redeemedVisitId");

-- CreateIndex
CREATE INDEX "ManagerReward_customerId_redeemedAt_revokedAt_expiresAt_idx" ON "ManagerReward"("customerId", "redeemedAt", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "ManagerReward_issuedByUserId_createdAt_idx" ON "ManagerReward"("issuedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ManagerReward_redeemedVisitId_idx" ON "ManagerReward"("redeemedVisitId");

-- AddForeignKey
ALTER TABLE "ManagerReward" ADD CONSTRAINT "ManagerReward_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReward" ADD CONSTRAINT "ManagerReward_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerReward" ADD CONSTRAINT "ManagerReward_redeemedVisitId_fkey" FOREIGN KEY ("redeemedVisitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
