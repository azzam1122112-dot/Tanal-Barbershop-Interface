-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Visit_barberId_idempotencyKey_key" ON "Visit"("barberId", "idempotencyKey");
