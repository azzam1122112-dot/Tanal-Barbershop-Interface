-- إسناد المشرفين إلى الفروع (User بدور SUPERVISOR ↔ Salon، علاقة متعددة لمتعددة).
-- المالك والمدير على مستوى المؤسسة فلا يحتاجان صفوفًا هنا.

-- CreateTable
CREATE TABLE "StaffSalon" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffSalon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffSalon_salonId_idx" ON "StaffSalon"("salonId");

-- CreateIndex
CREATE INDEX "StaffSalon_organizationId_idx" ON "StaffSalon"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSalon_userId_salonId_key" ON "StaffSalon"("userId", "salonId");

-- AddForeignKey
ALTER TABLE "StaffSalon" ADD CONSTRAINT "StaffSalon_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSalon" ADD CONSTRAINT "StaffSalon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSalon" ADD CONSTRAINT "StaffSalon_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
