-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "createdByBarberId" TEXT;

-- CreateIndex
CREATE INDEX "Customer_createdByBarberId_idx" ON "Customer"("createdByBarberId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdByBarberId_fkey" FOREIGN KEY ("createdByBarberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
