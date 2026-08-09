-- ضريبة القيمة المضافة الاختيارية على مستوى الفرع
ALTER TABLE "SystemSettings" ADD COLUMN "vatEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 15;
ALTER TABLE "SystemSettings" ADD COLUMN "vatInclusive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSettings" ADD COLUMN "vatNumber" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "legalName" TEXT;

-- تفصيل الضريبة ورقم الفاتورة على الزيارة
ALTER TABLE "Visit" ADD COLUMN "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Visit" ADD COLUMN "vatAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Visit" ADD COLUMN "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "Visit" ADD COLUMN "invoiceNumber" TEXT;

-- الزيارات السابقة بلا ضريبة: الصافي هو نفسه المبلغ قبل الضريبة.
UPDATE "Visit" SET "subtotalAmount" = "netAmount";

-- عدّاد الفواتير التسلسلي لكل فرع/سنة
CREATE TABLE "InvoiceCounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceCounter_salonId_year_key" ON "InvoiceCounter"("salonId", "year");
CREATE INDEX "InvoiceCounter_organizationId_idx" ON "InvoiceCounter"("organizationId");
CREATE UNIQUE INDEX "Visit_salonId_invoiceNumber_key" ON "Visit"("salonId", "invoiceNumber");
