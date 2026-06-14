ALTER TABLE "Visit"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT,
  ADD COLUMN "cancelReason" TEXT;

CREATE INDEX "Visit_cancelledByUserId_idx" ON "Visit"("cancelledByUserId");

ALTER TABLE "Visit" ADD CONSTRAINT "Visit_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
