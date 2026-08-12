-- محاذاة سلوك قيود عزل المستأجرين لجداول المستلزمات.
--
-- هجرة `20260812170000_supply_items` أنشأت قيود `%_tenant_fkey` بلا
-- ON UPDATE / ON DELETE، فصارت NO ACTION بينما القيد المفرد المقابل CASCADE أو
-- SET NULL أو RESTRICT. الاختلاف يعطّل الحذف والتنظيف ويجعل السلوك رهن ترتيب
-- المحفّزات — وهو ما يرصده `tests/tenant-fk-actions.test.ts`.
--
-- قاعدة جديدة تُصلحها هجرة المحاذاة العامة (18:00) لأنها تليها في الترتيب؛
-- أما قاعدة طبّقت 17:00 بعدها فتحتاج هذا التصحيح الصريح. الهجرة آمنة في
-- الحالتين: تُسقط القيد إن وُجد ثم تعيد بناءه بالسلوك الصحيح.

ALTER TABLE "SupplyItem" DROP CONSTRAINT IF EXISTS "SupplyItem_salon_tenant_fkey";
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_salon_tenant_fkey"
  FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "SupplyReport" DROP CONSTRAINT IF EXISTS "SupplyReport_salon_tenant_fkey";
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_salon_tenant_fkey"
  FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId")
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "SupplyReport" DROP CONSTRAINT IF EXISTS "SupplyReport_barber_tenant_fkey";
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_barber_tenant_fkey"
  FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "SupplyReport" DROP CONSTRAINT IF EXISTS "SupplyReport_resolver_tenant_fkey";
ALTER TABLE "SupplyReport" ADD CONSTRAINT "SupplyReport_resolver_tenant_fkey"
  FOREIGN KEY ("resolvedByUserId", "organizationId") REFERENCES "User"("id", "organizationId")
  ON UPDATE CASCADE ON DELETE SET NULL;
