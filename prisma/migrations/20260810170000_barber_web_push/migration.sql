-- CreateTable
CREATE TABLE "BarberPushSubscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "barberId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "lastSuccessAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BarberPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BarberPushSubscription_sessionId_key" ON "BarberPushSubscription"("sessionId");
CREATE UNIQUE INDEX "BarberPushSubscription_endpoint_key" ON "BarberPushSubscription"("endpoint");
CREATE INDEX "BarberPushSubscription_barberId_updatedAt_idx" ON "BarberPushSubscription"("barberId", "updatedAt");
CREATE INDEX "BarberPushSubscription_organizationId_idx" ON "BarberPushSubscription"("organizationId");

-- AddForeignKey
ALTER TABLE "BarberPushSubscription" ADD CONSTRAINT "BarberPushSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarberPushSubscription" ADD CONSTRAINT "BarberPushSubscription_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarberPushSubscription" ADD CONSTRAINT "BarberPushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
