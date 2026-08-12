-- مفاتيح المرور (WebAuthn) ودخول العميل برمز بريدي. إضافة بحتة.
--
-- **لا بيانات بيومترية.** البصمة وFace ID وقفل الجهاز لا تغادر جهاز العميل.
-- المخزَّن هنا مفتاح عام ومعرّف اعتماد وعدّاد توقيع — عامة بطبيعتها ولا تكفي
-- لانتحال أحد، فالتوقيع يحتاج مفتاحًا خاصًا محبوسًا في الجهاز لا نراه أبدًا.
--
-- لا DROP ولا حذف ولا تعديل بيانات قائمة.

-- غرض ثالث للرمز البريدي: الدخول لحساب موثّق مسبقًا.
ALTER TYPE "CustomerChallengePurpose" ADD VALUE IF NOT EXISTS 'LOGIN';

CREATE TYPE "CustomerWebAuthnPurpose" AS ENUM ('PASSKEY_REGISTRATION', 'PASSKEY_AUTHENTICATION');

CREATE TABLE "CustomerPasskey" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPasskey_pkey" PRIMARY KEY ("id")
);

-- معرّف الاعتماد فريد عالميًا بحكم المعيار: هو ما يُبحث به وقت الدخول قبل
-- معرفة صاحب الحساب.
CREATE UNIQUE INDEX "CustomerPasskey_credentialId_key" ON "CustomerPasskey"("credentialId");
CREATE INDEX "CustomerPasskey_customerAccountId_revokedAt_idx" ON "CustomerPasskey"("customerAccountId", "revokedAt");

ALTER TABLE "CustomerPasskey" ADD CONSTRAINT "CustomerPasskey_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerWebAuthnChallenge" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "purpose" "CustomerWebAuthnPurpose" NOT NULL,
    "challengeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerWebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

-- التحدي الخام لا يُخزَّن؛ البحث والتفرّد على تجزئته.
CREATE UNIQUE INDEX "CustomerWebAuthnChallenge_challengeHash_key" ON "CustomerWebAuthnChallenge"("challengeHash");
-- الاسم مقصوص إلى حدّ PostgreSQL (63 حرفًا) بنفس صيغة Prisma، وإلا اعتُبر انحرافًا.
CREATE INDEX "CustomerWebAuthnChallenge_customerAccountId_purpose_created_idx" ON "CustomerWebAuthnChallenge"("customerAccountId", "purpose", "createdAt");
CREATE INDEX "CustomerWebAuthnChallenge_expiresAt_idx" ON "CustomerWebAuthnChallenge"("expiresAt");

ALTER TABLE "CustomerWebAuthnChallenge" ADD CONSTRAINT "CustomerWebAuthnChallenge_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
