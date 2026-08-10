-- تصحيح دفاعي لقواعد طُبّقت قبل اكتمال هجرة إعدادات التجربة.
-- IF NOT EXISTS يجعلها آمنة على البيئات التي تحتوي الأعمدة أصلًا.
ALTER TABLE "Plan"
  ADD COLUMN IF NOT EXISTS "trialDays" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "city" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Plan_trialDays_range_check'
  ) THEN
    ALTER TABLE "Plan"
      ADD CONSTRAINT "Plan_trialDays_range_check" CHECK ("trialDays" BETWEEN 1 AND 365);
  END IF;
END $$;
