-- تفرّد جوال الحلاق على مستوى المؤسسة بدل الفرع، ليصبح الدخول بالجوال قطعيًا
-- ويمنع تكرار نفس الجوال في فرعين بنفس المؤسسة.

-- DropIndex
DROP INDEX "Barber_salonId_phone_key";

-- CreateIndex
CREATE UNIQUE INDEX "Barber_organizationId_phone_key" ON "Barber"("organizationId", "phone");
