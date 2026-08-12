-- طبقة الهوية العالمية — إضافة بحتة.
--
-- لا DELETE ولا DROP ولا UPDATE على أي صف قائم، ولا تعبئة رجعية لـ `accountId`،
-- ولا دمج عملاء بمطابقة جوال. بعد هذه الهجرة يبقى كل عميل حالي كما هو
-- بـ `accountId = NULL`، ويعمل النظام بلا أي فرق ملحوظ.

CREATE TYPE "CustomerAccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "status" "CustomerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- تفرّد عالمي بلا أي قيد مؤسسة: الهوية ليست كيان مستأجر.
-- `emailNormalized` يقبل NULL متكررًا لأن PostgreSQL يعتبر NULL مميّزًا عن NULL.
CREATE UNIQUE INDEX "CustomerAccount_phoneNormalized_key" ON "CustomerAccount"("phoneNormalized");
CREATE UNIQUE INDEX "CustomerAccount_emailNormalized_key" ON "CustomerAccount"("emailNormalized");
CREATE INDEX "CustomerAccount_status_idx" ON "CustomerAccount"("status");

ALTER TABLE "Customer" ADD COLUMN "accountId" TEXT;

-- هوية واحدة ≠ سجلّان في المؤسسة نفسها. NULL خارج القيد، فسجلات ما قبل
-- المطالبة تتعايش بلا حدّ داخل المؤسسة الواحدة.
CREATE UNIQUE INDEX "Customer_accountId_organizationId_key" ON "Customer"("accountId", "organizationId");

-- SET NULL: حذف الهوية العالمية يفكّ الارتباط ولا يمسّ سجل المؤسسة التشغيلي.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
