-- Extend composite tenant enforcement to secondary operational references.
ALTER TABLE "ManagerReward" ADD CONSTRAINT "ManagerReward_customer_tenant_fkey" FOREIGN KEY ("customerId", "organizationId") REFERENCES "Customer"("id", "organizationId") NOT VALID;
ALTER TABLE "ManagerReward" ADD CONSTRAINT "ManagerReward_issuer_tenant_fkey" FOREIGN KEY ("issuedByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "ManagerReward" ADD CONSTRAINT "ManagerReward_visit_tenant_fkey" FOREIGN KEY ("redeemedVisitId", "organizationId") REFERENCES "Visit"("id", "organizationId") NOT VALID;
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "InvoiceCounter" ADD CONSTRAINT "InvoiceCounter_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "Session" ADD CONSTRAINT "Session_user_tenant_fkey" FOREIGN KEY ("userId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "Session" ADD CONSTRAINT "Session_barber_tenant_fkey" FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "Session" ADD CONSTRAINT "Session_salon_tenant_fkey" FOREIGN KEY ("activeSalonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_opened_by_tenant_fkey" FOREIGN KEY ("openedByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_marked_by_tenant_fkey" FOREIGN KEY ("markedSentByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closed_by_tenant_fkey" FOREIGN KEY ("closedByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_salon_tenant_fkey" FOREIGN KEY ("salonId", "organizationId") REFERENCES "Salon"("id", "organizationId") NOT VALID;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_tenant_fkey" FOREIGN KEY ("actorUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_barber_tenant_fkey" FOREIGN KEY ("actorBarberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_recorded_user_tenant_fkey" FOREIGN KEY ("recordedByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_recorded_barber_tenant_fkey" FOREIGN KEY ("recordedByBarberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_recorded_user_tenant_fkey" FOREIGN KEY ("recordedByUserId", "organizationId") REFERENCES "User"("id", "organizationId") NOT VALID;
ALTER TABLE "CashExpense" ADD CONSTRAINT "CashExpense_recorded_barber_tenant_fkey" FOREIGN KEY ("recordedByBarberId", "organizationId") REFERENCES "Barber"("id", "organizationId") NOT VALID;

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
           WHERE conname LIKE '%_tenant_fkey' AND NOT convalidated
  LOOP EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', c.tbl, c.conname); END LOOP;
END $$;
