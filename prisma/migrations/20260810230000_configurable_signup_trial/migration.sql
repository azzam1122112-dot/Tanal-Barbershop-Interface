ALTER TABLE "Plan"
  ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "Organization"
  ADD COLUMN "city" TEXT;

ALTER TABLE "Plan"
  ADD CONSTRAINT "Plan_trialDays_range_check" CHECK ("trialDays" BETWEEN 1 AND 365);
