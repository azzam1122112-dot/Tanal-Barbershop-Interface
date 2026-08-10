-- سياسة عدم الحضور تبدأ من تفعيل هذه الهجرة؛ لا نعاقب العميل بأثر رجعي
-- على مواعيد قديمة لم تكن السياسة معلنة له وقتها.
ALTER TABLE "Customer"
  ADD COLUMN "bookingNoShowCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bookingBlockedAt" TIMESTAMP(3),
  ADD COLUMN "bookingBlockReason" TEXT;

CREATE INDEX "Customer_organizationId_bookingBlockedAt_idx"
  ON "Customer"("organizationId", "bookingBlockedAt");
