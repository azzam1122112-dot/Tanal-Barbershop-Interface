-- نسبة حركة النقاط إلى الفرع الذي وقعت فيه، وإضافة لقطة الرصيد قبلها ومنفّذها.
--
-- النطاق يبقى كما هو: الرصيد مؤسسي على `LoyaltyAccount`، و`salonId` هنا مكان
-- وقوع الحركة لأغراض التقارير والتدقيق فقط. لا يُلمس أي رصيد تاريخي، ولا تُحذف
-- ولا تُعدَّل أي حركة قائمة — التعبئة تملأ أعمدة جديدة فقط.

-- 1) أعمدة جديدة، كلها nullable أولًا حتى تمرّ على جدول فيه بيانات.
ALTER TABLE "LoyaltyTransaction" ADD COLUMN "salonId" TEXT;
ALTER TABLE "LoyaltyTransaction" ADD COLUMN "balanceBefore" INTEGER;
ALTER TABLE "LoyaltyTransaction" ADD COLUMN "recordedByUserId" TEXT;
ALTER TABLE "LoyaltyTransaction" ADD COLUMN "recordedByBarberId" TEXT;

-- 2) تعبئة الفرع تاريخيًا من الزيارة المرتبطة. الحركة بلا زيارة تبقى بلا فرع
--    (لا نخمّن مكانًا لم يُسجَّل).
UPDATE "LoyaltyTransaction" lt
SET "salonId" = v."salonId"
FROM "Visit" v
WHERE lt."visitId" = v."id"
  AND lt."salonId" IS NULL
  -- حارس عزل: لا تنسب حركة إلى فرع من مؤسسة أخرى مهما كانت حالة البيانات.
  AND v."organizationId" = lt."organizationId";

-- 3) الرصيد قبل الحركة مشتق حسابيًا من الرصيد بعدها ومقدارها — قيمة دقيقة لا
--    تقدير، ولا تحتاج قراءة تسلسل الحركات.
UPDATE "LoyaltyTransaction"
SET "balanceBefore" = "balanceAfter" - "points"
WHERE "balanceBefore" IS NULL;

ALTER TABLE "LoyaltyTransaction" ALTER COLUMN "balanceBefore" SET NOT NULL;

-- 4) فهارس تقارير الولاء: مدى زمني للمؤسسة، ومقسّمًا بالفرع، ومقسّمًا بالنوع.
CREATE INDEX "LoyaltyTransaction_organizationId_createdAt_idx" ON "LoyaltyTransaction"("organizationId", "createdAt");
CREATE INDEX "LoyaltyTransaction_organizationId_salonId_createdAt_idx" ON "LoyaltyTransaction"("organizationId", "salonId", "createdAt");
CREATE INDEX "LoyaltyTransaction_organizationId_type_createdAt_idx" ON "LoyaltyTransaction"("organizationId", "type", "createdAt");

-- 5) عزل المستأجرين على النمط القائم: مستحيل أن تحمل الحركة فرعًا أو منفّذًا من
--    مؤسسة أخرى — تُفرض في القاعدة لا في التطبيق وحده.
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_recorded_user_tenant_fkey" FOREIGN KEY ("recordedByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_recorded_barber_tenant_fkey" FOREIGN KEY ("recordedByBarberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
           WHERE conname LIKE 'LoyaltyTransaction_%_tenant_fkey' AND NOT convalidated
  LOOP EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tbl, c.conname); END LOOP;
END $$;
