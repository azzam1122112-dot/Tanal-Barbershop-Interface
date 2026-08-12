-- المستلزمات التشغيلية: أمواس، رغوة، مناشف، مطهّر.
--
-- مفصولة عن `Product` عمدًا وبلا أي حقل مالي: لا سعر ولا تكلفة ولا كمية
-- تُحاسب. الغرض تشغيلي بحت — يعرف الفرع أن الصنف نفد، وتعرف الإدارة أن تورّده.
--
-- ملاحظة صيانة: كُتبت يدويًا لا عبر `prisma migrate dev` (انظر CLAUDE.md).

-- CreateEnum
CREATE TYPE "SupplyStatus" AS ENUM ('AVAILABLE', 'LOW', 'OUT');
CREATE TYPE "SupplyReportState" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "status" "SupplyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastReportedAt" TIMESTAMP(3),
    "lastRestockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplyReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "status" "SupplyStatus" NOT NULL,
    "note" TEXT,
    "state" "SupplyReportState" NOT NULL DEFAULT 'OPEN',
    "escalatedByBarberId" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyReport_pkey" PRIMARY KEY ("id"),
    -- بلاغ «متوفر» لا معنى له: البلاغ يعني نقصًا.
    CONSTRAINT "SupplyReport_shortage_only" CHECK ("status" <> 'AVAILABLE')
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_salonId_name_key" ON "SupplyItem"("salonId", "name");
CREATE INDEX "SupplyItem_salonId_isActive_sortOrder_idx" ON "SupplyItem"("salonId", "isActive", "sortOrder");
CREATE INDEX "SupplyItem_organizationId_status_idx" ON "SupplyItem"("organizationId", "status");
CREATE INDEX "SupplyReport_organizationId_state_createdAt_idx" ON "SupplyReport"("organizationId", "state", "createdAt");
CREATE INDEX "SupplyReport_salonId_state_createdAt_idx" ON "SupplyReport"("salonId", "state", "createdAt");
CREATE INDEX "SupplyReport_supplyItemId_createdAt_idx" ON "SupplyReport"("supplyItemId", "createdAt");

-- بلاغ واحد مفتوح لكل صنف مهما بلّغ عدد الحلاقين: الفهرس الجزئي يفرضه في
-- قاعدة البيانات، فلا يتسلل تكرار من طلبين متزامنين يفوتان فحص الشيفرة.
CREATE UNIQUE INDEX "SupplyReport_one_open_per_item" ON "SupplyReport"("supplyItemId") WHERE "state" = 'OPEN';

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_escalatedByBarberId_fkey" FOREIGN KEY ("escalatedByBarberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- عزل المستأجرين على مستوى قاعدة البيانات، بنفس نمط هجرة التقوية الأمنية.
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId");
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_resolver_tenant_fkey" FOREIGN KEY ("resolvedByUserId", "organizationId") REFERENCES "User"("id", "organizationId");
