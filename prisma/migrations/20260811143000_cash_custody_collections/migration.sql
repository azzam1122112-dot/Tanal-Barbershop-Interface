-- Cash custody is an operational ledger, independent from revenue and expenses.
CREATE TYPE "CashCustodyMovementType" AS ENUM (
  'OPENING_BALANCE', 'CASH_SALE', 'CASH_EXPENSE', 'COLLECTION',
  'COLLECTION_REVERSAL', 'VISIT_REVERSAL', 'PAYMENT_METHOD_ADJUSTMENT',
  'VISIT_AMOUNT_ADJUSTMENT', 'EXPENSE_REVERSAL', 'COUNT_ADJUSTMENT',
  'SAFE_OWNER_PICKUP', 'SAFE_BANK_DEPOSIT'
);
CREATE TYPE "CashCollectionScheduleMode" AS ENUM ('DISABLED', 'INTERVAL', 'WEEKDAYS');

ALTER TABLE "CashSession"
  ADD COLUMN "collectionsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "BarberCashBalance" (
  "barberId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "salonId" TEXT NOT NULL,
  "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "isInitialized" BOOLEAN NOT NULL DEFAULT false,
  "initializedAt" TIMESTAMP(3),
  "lastMovementAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BarberCashBalance_pkey" PRIMARY KEY ("barberId")
);

CREATE TABLE "BranchCashSafe" (
  "salonId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lastMovementAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchCashSafe_pkey" PRIMARY KEY ("salonId"),
  CONSTRAINT "BranchCashSafe_nonnegative" CHECK ("balance" >= 0)
);

CREATE TABLE "CashCustodyMovement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "salonId" TEXT NOT NULL,
  "barberId" TEXT,
  "cashSessionId" TEXT,
  "type" "CashCustodyMovementType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "barberDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "branchDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "barberBalanceBefore" DECIMAL(12,2),
  "barberBalanceAfter" DECIMAL(12,2),
  "branchBalanceBefore" DECIMAL(12,2),
  "branchBalanceAfter" DECIMAL(12,2),
  "referenceKey" TEXT NOT NULL,
  "referenceId" TEXT,
  "note" TEXT,
  "actorType" "AuditActorType" NOT NULL,
  "actorUserId" TEXT,
  "actorBarberId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashCustodyMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashCustodyMovement_positive_amount" CHECK ("amount" > 0)
);

CREATE TABLE "CashCollection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "salonId" TEXT NOT NULL,
  "barberId" TEXT NOT NULL,
  "cashSessionId" TEXT,
  "collectedByUserId" TEXT NOT NULL,
  "expectedBefore" DECIMAL(12,2) NOT NULL,
  "countedAmount" DECIMAL(12,2) NOT NULL,
  "discrepancyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discrepancyReason" TEXT,
  "collectedAmount" DECIMAL(12,2) NOT NULL,
  "remainingAfter" DECIMAL(12,2) NOT NULL,
  "branchSafeAfter" DECIMAL(12,2) NOT NULL,
  "note" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversedByUserId" TEXT,
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashCollection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashCollection_valid_amounts" CHECK (
    "expectedBefore" >= 0 AND "countedAmount" >= 0 AND "collectedAmount" > 0
    AND "collectedAmount" <= "countedAmount" AND "remainingAfter" = "countedAmount" - "collectedAmount"
    AND "discrepancyAmount" = "countedAmount" - "expectedBefore"
  )
);

CREATE TABLE "CashCollectionPolicy" (
  "salonId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "mode" "CashCollectionScheduleMode" NOT NULL DEFAULT 'DISABLED',
  "intervalDays" INTEGER NOT NULL DEFAULT 1,
  "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "thresholdAmount" DECIMAL(12,2),
  "reminderHour" INTEGER NOT NULL DEFAULT 17,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashCollectionPolicy_pkey" PRIMARY KEY ("salonId"),
  CONSTRAINT "CashCollectionPolicy_valid_values" CHECK (
    "intervalDays" BETWEEN 1 AND 30 AND "reminderHour" BETWEEN 0 AND 23
    AND ("thresholdAmount" IS NULL OR "thresholdAmount" > 0)
  )
);

CREATE INDEX "BarberCashBalance_organizationId_salonId_idx" ON "BarberCashBalance"("organizationId", "salonId");
CREATE INDEX "BarberCashBalance_salonId_isInitialized_idx" ON "BarberCashBalance"("salonId", "isInitialized");
CREATE INDEX "BranchCashSafe_organizationId_idx" ON "BranchCashSafe"("organizationId");
CREATE UNIQUE INDEX "CashCustodyMovement_referenceKey_key" ON "CashCustodyMovement"("referenceKey");
CREATE INDEX "CashCustodyMovement_organizationId_occurredAt_idx" ON "CashCustodyMovement"("organizationId", "occurredAt");
CREATE INDEX "CashCustodyMovement_salonId_occurredAt_idx" ON "CashCustodyMovement"("salonId", "occurredAt");
CREATE INDEX "CashCustodyMovement_barberId_occurredAt_idx" ON "CashCustodyMovement"("barberId", "occurredAt");
CREATE INDEX "CashCustodyMovement_cashSessionId_idx" ON "CashCustodyMovement"("cashSessionId");
CREATE INDEX "CashCustodyMovement_referenceId_idx" ON "CashCustodyMovement"("referenceId");
CREATE INDEX "CashCollection_salonId_collectedAt_idx" ON "CashCollection"("salonId", "collectedAt");
CREATE INDEX "CashCollection_barberId_collectedAt_idx" ON "CashCollection"("barberId", "collectedAt");
CREATE INDEX "CashCollection_cashSessionId_idx" ON "CashCollection"("cashSessionId");
CREATE INDEX "CashCollection_reversedAt_idx" ON "CashCollection"("reversedAt");
CREATE UNIQUE INDEX "CashCollection_organizationId_idempotencyKey_key" ON "CashCollection"("organizationId", "idempotencyKey");
CREATE INDEX "CashCollectionPolicy_organizationId_idx" ON "CashCollectionPolicy"("organizationId");

ALTER TABLE "BarberCashBalance" ADD CONSTRAINT "BarberCashBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarberCashBalance" ADD CONSTRAINT "BarberCashBalance_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarberCashBalance" ADD CONSTRAINT "BarberCashBalance_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchCashSafe" ADD CONSTRAINT "BranchCashSafe_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchCashSafe" ADD CONSTRAINT "BranchCashSafe_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCustodyMovement" ADD CONSTRAINT "CashCustodyMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCustodyMovement" ADD CONSTRAINT "CashCustodyMovement_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCustodyMovement" ADD CONSTRAINT "CashCustodyMovement_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_collectedByUserId_fkey" FOREIGN KEY ("collectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashCollectionPolicy" ADD CONSTRAINT "CashCollectionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCollectionPolicy" ADD CONSTRAINT "CashCollectionPolicy_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth: every branch, barber, session and user reference must belong to the same tenant.
ALTER TABLE "BarberCashBalance" ADD CONSTRAINT "BarberCashBalance_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "BarberCashBalance" ADD CONSTRAINT "BarberCashBalance_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId");
ALTER TABLE "BranchCashSafe" ADD CONSTRAINT "BranchCashSafe_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "CashCustodyMovement" ADD CONSTRAINT "CashCustodyMovement_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "CashCustodyMovement" ADD CONSTRAINT "CashCustodyMovement_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId");
ALTER TABLE "CashCustodyMovement" ADD CONSTRAINT "CashCustodyMovement_session_tenant_fkey" FOREIGN KEY ("cashSessionId", "organizationId") REFERENCES "CashSession"("id", "organizationId");
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId");
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_session_tenant_fkey" FOREIGN KEY ("cashSessionId", "organizationId") REFERENCES "CashSession"("id", "organizationId");
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_collector_tenant_fkey" FOREIGN KEY ("collectedByUserId", "organizationId") REFERENCES "User"("id", "organizationId");
ALTER TABLE "CashCollection" ADD CONSTRAINT "CashCollection_reverser_tenant_fkey" FOREIGN KEY ("reversedByUserId", "organizationId") REFERENCES "User"("id", "organizationId");
ALTER TABLE "CashCollectionPolicy" ADD CONSTRAINT "CashCollectionPolicy_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId");
