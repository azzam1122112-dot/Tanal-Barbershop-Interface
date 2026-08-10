CREATE TYPE "DataSubjectRequestType" AS ENUM ('ACCESS', 'COPY', 'CORRECTION', 'DELETION', 'WITHDRAW_CONSENT');
CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

ALTER TABLE "Organization"
  ADD COLUMN "inactiveSince" TIMESTAMP(3),
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyVersion" TEXT,
  ADD COLUMN "dpaAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "dpaVersion" TEXT,
  ADD COLUMN "legalAcceptedIp" TEXT,
  ADD COLUMN "legalAcceptedUserAgent" TEXT;

ALTER TABLE "BillingInvoice"
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "sellerName" TEXT,
  ADD COLUMN "sellerFreelanceDocument" TEXT,
  ADD COLUMN "sellerActivity" TEXT,
  ADD COLUMN "buyerName" TEXT,
  ADD COLUMN "buyerCity" TEXT;

CREATE TABLE "BillingInvoiceCounter" (
  "year" INTEGER NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingInvoiceCounter_pkey" PRIMARY KEY ("year")
);

CREATE TABLE "DataSubjectRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" "DataSubjectRequestType" NOT NULL,
  "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'OPEN',
  "details" TEXT,
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingInvoice_invoiceNumber_key" ON "BillingInvoice"("invoiceNumber");
CREATE INDEX "Organization_subscriptionStatus_inactiveSince_idx" ON "Organization"("subscriptionStatus", "inactiveSince");
CREATE INDEX "DataSubjectRequest_organizationId_status_createdAt_idx" ON "DataSubjectRequest"("organizationId", "status", "createdAt");
CREATE INDEX "DataSubjectRequest_customerId_createdAt_idx" ON "DataSubjectRequest"("customerId", "createdAt");

ALTER TABLE "DataSubjectRequest"
  ADD CONSTRAINT "DataSubjectRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DataSubjectRequest"
  ADD CONSTRAINT "DataSubjectRequest_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
