-- مصادقة العميل: تحدٍّ بريدي وجلسة مستقلة. إضافة بحتة.
--
-- لا تمسّ `Session` ولا `Customer` ولا أي جدول تشغيلي. جلسة العميل جدول مستقل
-- عمدًا: مشاركة `Session` كانت ستجعل كل قارئ لها يحتاج تمييز نوع الفاعل، وأول
-- موضع ينساه يمنح عميلًا صلاحية موظف.

CREATE TYPE "CustomerChallengePurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

CREATE TABLE "CustomerEmailChallenge" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "purpose" "CustomerChallengePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEmailChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerEmailChallenge_customerAccountId_purpose_createdAt_idx" ON "CustomerEmailChallenge"("customerAccountId", "purpose", "createdAt");
CREATE INDEX "CustomerEmailChallenge_expiresAt_idx" ON "CustomerEmailChallenge"("expiresAt");

ALTER TABLE "CustomerEmailChallenge" ADD CONSTRAINT "CustomerEmailChallenge_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- الرمز الخام لا يُخزَّن؛ التفرّد على تجزئته.
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_customerAccountId_expiresAt_idx" ON "CustomerSession"("customerAccountId", "expiresAt");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
