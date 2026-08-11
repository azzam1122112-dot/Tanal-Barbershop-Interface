-- صرف عمولات الحلاقين: كيان مستقل عن المصروفات حتى لا تُخصم العمولة مرتين
-- من ربح المؤسسة (مرة عند الاستحقاق ومرة عند الصرف).
--
-- ملاحظة صيانة: `prisma migrate dev` يولّد في هذه الهجرة إسقاطًا لقيود عزل
-- المستأجرين المخصّصة (`%_tenant_fkey` والفهارس المركّبة) لأنها SQL لا يعرفه
-- المخطط. حُذفت تلك الأسطر يدويًا — لا تُعِدها.

-- CreateEnum
CREATE TYPE "CommissionPayoutMethod" AS ENUM ('BANK_TRANSFER', 'CASH_FROM_SAFE', 'BARBER_CUSTODY_DEDUCTION', 'OPENING_SETTLEMENT');

-- AlterEnum
ALTER TYPE "CashCustodyMovementType" ADD VALUE 'SAFE_COMMISSION_PAYOUT';
ALTER TYPE "CashCustodyMovementType" ADD VALUE 'CUSTODY_COMMISSION_PAYOUT';
ALTER TYPE "CashCustodyMovementType" ADD VALUE 'CUSTODY_COMMISSION_PAYOUT_REVERSAL';
ALTER TYPE "CashCustodyMovementType" ADD VALUE 'SAFE_COMMISSION_PAYOUT_REVERSAL';

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "CommissionPayoutMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "accruedSnapshot" DECIMAL(12,2) NOT NULL,
    "paidBeforeSnapshot" DECIMAL(12,2) NOT NULL,
    "outstandingAfter" DECIMAL(12,2) NOT NULL,
    "paidByUserId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommissionPayout_positive_amount" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "CommissionPayout_barberId_paidAt_idx" ON "CommissionPayout"("barberId", "paidAt");
CREATE INDEX "CommissionPayout_organizationId_paidAt_idx" ON "CommissionPayout"("organizationId", "paidAt");
CREATE INDEX "CommissionPayout_salonId_paidAt_idx" ON "CommissionPayout"("salonId", "paidAt");
CREATE INDEX "CommissionPayout_reversedAt_idx" ON "CommissionPayout"("reversedAt");
CREATE UNIQUE INDEX "CommissionPayout_organizationId_idempotencyKey_key" ON "CommissionPayout"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_paidByUserId_fkey" FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- عزل المستأجرين على مستوى قاعدة البيانات، بنفس نمط هجرة التقوية الأمنية:
-- لا يمكن ربط سند صرف بفرع أو حلاق أو مستخدم من مؤسسة أخرى.
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId");
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_payer_tenant_fkey" FOREIGN KEY ("paidByUserId", "organizationId") REFERENCES "User"("id", "organizationId");
