ALTER TABLE "BillingInvoice"
  ADD COLUMN "invoiceEmailRecipient" TEXT,
  ADD COLUMN "invoiceEmailProviderId" TEXT,
  ADD COLUMN "invoiceEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "invoiceEmailLastError" TEXT,
  ADD COLUMN "invoiceEmailAttempts" INTEGER NOT NULL DEFAULT 0;
