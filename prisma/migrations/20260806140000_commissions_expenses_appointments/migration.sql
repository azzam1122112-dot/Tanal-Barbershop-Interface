-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SUPPLIES', 'MAINTENANCE', 'UTILITIES', 'STAFF_ADVANCE', 'REFUND', 'OTHER');
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "AppointmentSource" AS ENUM ('STAFF', 'CUSTOMER');

-- عمولات الحلاقين
ALTER TABLE "Barber" ADD COLUMN "commissionRate" DECIMAL(5,2);
ALTER TABLE "Service" ADD COLUMN "commissionRate" DECIMAL(5,2);
ALTER TABLE "Service" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Visit" ADD COLUMN "commissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "VisitService" ADD COLUMN "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "VisitService" ADD COLUMN "commissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- النسبة الافتراضية للفرع
ALTER TABLE "SystemSettings" ADD COLUMN "defaultCommissionRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- بوابة العميل
ALTER TABLE "Customer" ADD COLUMN "portalToken" TEXT;
CREATE UNIQUE INDEX "Customer_portalToken_key" ON "Customer"("portalToken");

-- مصروفات جلسة الصندوق
ALTER TABLE "CashSession" ADD COLUMN "expensesTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "CashExpense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "barberId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "note" TEXT NOT NULL,
    "recordedByUserId" TEXT,
    "recordedByBarberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashExpense_organizationId_createdAt_idx" ON "CashExpense"("organizationId", "createdAt");
CREATE INDEX "CashExpense_salonId_createdAt_idx" ON "CashExpense"("salonId", "createdAt");
CREATE INDEX "CashExpense_cashSessionId_idx" ON "CashExpense"("cashSessionId");
CREATE INDEX "CashExpense_barberId_idx" ON "CashExpense"("barberId");

ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- المواعيد
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "barberId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "source" "AppointmentSource" NOT NULL DEFAULT 'STAFF',
    "notes" TEXT,
    "visitId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Appointment_visitId_key" ON "Appointment"("visitId");
CREATE INDEX "Appointment_salonId_startAt_idx" ON "Appointment"("salonId", "startAt");
CREATE INDEX "Appointment_organizationId_startAt_idx" ON "Appointment"("organizationId", "startAt");
CREATE INDEX "Appointment_barberId_startAt_idx" ON "Appointment"("barberId", "startAt");
CREATE INDEX "Appointment_status_startAt_idx" ON "Appointment"("status", "startAt");
CREATE INDEX "Appointment_customerId_idx" ON "Appointment"("customerId");

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
