-- Composite indexes used by dashboard, report, appointment, and cash-session queries.
-- PostgreSQL can create these during the normal `prisma migrate deploy` step.
CREATE INDEX IF NOT EXISTS "Visit_organizationId_status_visitedAt_idx"
  ON "Visit"("organizationId", "status", "visitedAt");
CREATE INDEX IF NOT EXISTS "Visit_salonId_status_visitedAt_idx"
  ON "Visit"("salonId", "status", "visitedAt");
CREATE INDEX IF NOT EXISTS "CashSession_organizationId_status_closedAt_idx"
  ON "CashSession"("organizationId", "status", "closedAt");
CREATE INDEX IF NOT EXISTS "CashSession_salonId_status_closedAt_idx"
  ON "CashSession"("salonId", "status", "closedAt");
CREATE INDEX IF NOT EXISTS "Appointment_organizationId_salonId_status_startAt_idx"
  ON "Appointment"("organizationId", "salonId", "status", "startAt");
