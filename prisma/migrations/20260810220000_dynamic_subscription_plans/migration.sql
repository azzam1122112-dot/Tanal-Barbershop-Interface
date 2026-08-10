ALTER TABLE "Plan"
  ADD COLUMN "priceYearly" DECIMAL(10,2),
  ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isSignupDefault" BOOLEAN NOT NULL DEFAULT false;

-- الباقة المجانية الحالية مخصصة للتجربة ولا تظهر كخيار مدفوع في الموقع.
UPDATE "Plan"
SET "isPublic" = false,
    "isSignupDefault" = true,
    "description" = COALESCE("description", 'تجربة كاملة لمدة 14 يومًا')
WHERE "priceMonthly" = 0;

INSERT INTO "Plan" (
  "id", "name", "slug", "description", "priceMonthly", "priceYearly", "features",
  "maxSalons", "maxBarbers", "maxCustomers", "isActive", "isPublic", "isFeatured",
  "isSignupDefault", "sortOrder", "createdAt", "updatedAt"
)
VALUES
  (
    'plan_xmansx_start', 'XMANSX بداية', 'xmansx-start',
    'لصالون واحد يريد تشغيل الصندوق والحجوزات والعمولات من نظام واحد.',
    129, 1290,
    ARRAY['جميع خصائص التشغيل', 'فرع واحد', 'حتى 5 حلاقين', 'عملاء وحجوزات غير محدودة', 'دعم فني عبر واتساب'],
    1, 5, NULL, true, true, false, false, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'plan_xmansx_growth', 'XMANSX نمو', 'xmansx-growth',
    'للصالون المزدحم الذي يحتاج سعة أكبر وتهيئة ودعمًا بأولوية.',
    249, 2490,
    ARRAY['جميع خصائص التشغيل', 'فرع واحد', 'حتى 15 حلاقًا', 'عملاء وحجوزات غير محدودة', 'تهيئة وتدريب عن بُعد', 'دعم بأولوية'],
    1, 15, NULL, true, true, true, false, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'plan_xmansx_branches', 'XMANSX فروع', 'xmansx-branches',
    'لإدارة عدة فروع ومقارنتها مع صلاحيات مستقلة للمشرفين.',
    499, 4990,
    ARRAY['جميع خصائص التشغيل', 'حتى 3 فروع', 'حتى 40 حلاقًا', 'مقارنة الفروع', 'مشرفون حسب الفرع', 'تهيئة ودعم أولوية'],
    3, 40, NULL, true, true, false, false, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("slug") DO NOTHING;

DROP INDEX IF EXISTS "Plan_isActive_sortOrder_idx";
CREATE INDEX "Plan_isActive_isPublic_sortOrder_idx" ON "Plan"("isActive", "isPublic", "sortOrder");
