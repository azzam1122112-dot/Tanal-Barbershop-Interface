-- دوام مستقل اختياري لكل حلاق. القيم لا تُستخدم إلا عند workScheduleEnabled=true؛
-- وإلا يبقى الحلاق وارثًا لدوام الفرع بلا تغيير في السلوك الحالي.
ALTER TABLE "Barber"
  ADD COLUMN "workScheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workStartMinute" INTEGER NOT NULL DEFAULT 960,
  ADD COLUMN "workEndMinute" INTEGER NOT NULL DEFAULT 1380,
  ADD COLUMN "workClosedWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- قاعدة المنصة الجديدة: لا حجز ذاتي قبل مرور ساعتين من الآن.
ALTER TABLE "SystemSettings" ALTER COLUMN "bookingLeadMinutes" SET DEFAULT 120;
UPDATE "SystemSettings"
SET "bookingLeadMinutes" = 120
WHERE "bookingLeadMinutes" < 120;
