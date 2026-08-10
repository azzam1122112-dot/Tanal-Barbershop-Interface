-- حافظ على سلوك العمولة السابق للحلاقين الحاليين الذين كانوا يرثون نسبة الفرع
-- أو يعملون على خدمات/منتجات ذات نسبة خاصة. الحلاقون الجدد يظلون معطلين افتراضيًا.
UPDATE "Barber" AS barber
SET "commissionEnabled" = true
WHERE barber."commissionEnabled" = false
  AND (
    EXISTS (
      SELECT 1
      FROM "SystemSettings" AS settings
      WHERE settings."salonId" = barber."salonId"
        AND settings."defaultCommissionRate" > 0
    )
    OR EXISTS (
      SELECT 1
      FROM "Service" AS service
      WHERE service."salonId" = barber."salonId"
        AND service."commissionRate" IS NOT NULL
        AND service."commissionRate" > 0
    )
    OR EXISTS (
      SELECT 1
      FROM "Product" AS product
      WHERE product."salonId" = barber."salonId"
        AND product."commissionRate" IS NOT NULL
        AND product."commissionRate" > 0
    )
  );
