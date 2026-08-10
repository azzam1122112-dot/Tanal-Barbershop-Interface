-- إثبات عرض إشعار الخصوصية عند التسجيل العام.
ALTER TABLE "Customer"
  ADD COLUMN "privacyNoticeAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "privacyNoticeVersion" TEXT,
  ADD COLUMN "privacyNoticeControllerName" TEXT;

-- بيانات لازمة للتحقق والتنفيذ الفعلي لطلبات أصحاب البيانات.
ALTER TABLE "DataSubjectRequest"
  ADD COLUMN "requestedName" TEXT,
  ADD COLUMN "requestedPhone" TEXT,
  ADD COLUMN "identityVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "identityVerificationMethod" TEXT,
  ADD COLUMN "executedAt" TIMESTAMP(3);

-- إزالة إعدادات وحقول حساب الضريبة من المنتج.
ALTER TABLE "SystemSettings"
  DROP COLUMN "vatEnabled",
  DROP COLUMN "vatRate",
  DROP COLUMN "vatInclusive",
  DROP COLUMN "vatNumber";

ALTER TABLE "Visit"
  DROP COLUMN "subtotalAmount",
  DROP COLUMN "vatAmount",
  DROP COLUMN "vatRate";
