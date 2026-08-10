-- يبقى سجل طلب الخصوصية لإثبات التنفيذ بعد حذف سجل العميل نفسه.
ALTER TABLE "DataSubjectRequest" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "DataSubjectRequest" DROP CONSTRAINT IF EXISTS "DataSubjectRequest_customerId_fkey";
ALTER TABLE "DataSubjectRequest"
  ADD CONSTRAINT "DataSubjectRequest_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
