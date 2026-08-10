-- A sale may be completed without retaining customer personal data.
ALTER TABLE "Visit" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "Visit" DROP CONSTRAINT IF EXISTS "Visit_customerId_fkey";
ALTER TABLE "Visit"
  ADD CONSTRAINT "Visit_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Visit"
  ADD COLUMN "cashTenderedAmount" DECIMAL(10,2),
  ADD COLUMN "cashChangeAmount" DECIMAL(10,2);

ALTER TABLE "CashSession"
  ADD COLUMN "openingCashAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TYPE "ExpensePaymentSource" AS ENUM ('CASH_DRAWER', 'EXTERNAL');

ALTER TABLE "CashExpense"
  ADD COLUMN "paymentSource" "ExpensePaymentSource" NOT NULL DEFAULT 'CASH_DRAWER',
  ADD COLUMN "payee" TEXT,
  ADD COLUMN "reference" TEXT;

CREATE INDEX "CashExpense_organizationId_paymentSource_createdAt_idx"
  ON "CashExpense"("organizationId", "paymentSource", "createdAt");
