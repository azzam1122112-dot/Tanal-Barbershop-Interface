ALTER TABLE "CashExpense"
  ADD COLUMN "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- السجلات السابقة تُنسب إلى وقت تسجيلها بدل وقت تشغيل الهجرة.
UPDATE "CashExpense" SET "expenseDate" = "createdAt";

CREATE INDEX "CashExpense_organizationId_expenseDate_idx"
  ON "CashExpense"("organizationId", "expenseDate");

CREATE INDEX "CashExpense_salonId_expenseDate_idx"
  ON "CashExpense"("salonId", "expenseDate");
