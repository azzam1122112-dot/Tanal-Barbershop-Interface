-- بلاغات المخزون من الحلاق: بلاغ لا حركة.
-- الحلاق يرى الرفّ قبل أي أحد، لكن خصم المخزون بيده يفتح باب إخراج بضاعة بلا
-- رقابة. البلاغ يُسجَّل هنا ولا يمسّ الكمية حتى تعتمده الإدارة فتنشأ حركة.
--
-- ملاحظة صيانة: كُتبت يدويًا لا عبر `prisma migrate dev`، لأن المولّد يضيف
-- إسقاطًا لقيود عزل المستأجرين المخصّصة (انظر CLAUDE.md).

-- CreateEnum
CREATE TYPE "StockReportType" AS ENUM ('LOW_STOCK', 'DAMAGED', 'MISSING');
CREATE TYPE "StockReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "StockReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "type" "StockReportType" NOT NULL,
    "quantity" INTEGER,
    "note" TEXT,
    "status" "StockReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReport_pkey" PRIMARY KEY ("id"),
    -- كمية موجبة أو لا كمية: صفر أو سالب لا يعني شيئًا في بلاغ.
    CONSTRAINT "StockReport_positive_quantity" CHECK ("quantity" IS NULL OR "quantity" > 0)
);

-- CreateIndex
CREATE INDEX "StockReport_organizationId_status_createdAt_idx" ON "StockReport"("organizationId", "status", "createdAt");
CREATE INDEX "StockReport_salonId_status_createdAt_idx" ON "StockReport"("salonId", "status", "createdAt");
CREATE INDEX "StockReport_productId_createdAt_idx" ON "StockReport"("productId", "createdAt");
CREATE INDEX "StockReport_barberId_createdAt_idx" ON "StockReport"("barberId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- عزل المستأجرين على مستوى قاعدة البيانات، بنفس نمط هجرة التقوية الأمنية:
-- لا يُربط بلاغ بفرع أو منتج أو حلاق أو مستخدم من مؤسسة أخرى.
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_product_tenant_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId");
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId");
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_resolver_tenant_fkey" FOREIGN KEY ("resolvedByUserId", "organizationId") REFERENCES "User"("id", "organizationId");
