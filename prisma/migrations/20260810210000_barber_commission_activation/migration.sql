-- العمولة اختيار صريح لكل حلاق؛ الحلاقون ذوو النسبة الخاصة الحالية يبقون مفعّلين.
ALTER TABLE "Barber" ADD COLUMN "commissionEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Barber"
SET "commissionEnabled" = true
WHERE "commissionRate" IS NOT NULL AND "commissionRate" > 0;
