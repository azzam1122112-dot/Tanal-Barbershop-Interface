-- Session deletion must preserve collection history and custody movements by clearing
-- the optional session pointer. A composite tenant FK cannot SET NULL only on the
-- session id, so tenant consistency remains enforced by scoped writes and the simple FK.
ALTER TABLE "CashCustodyMovement" DROP CONSTRAINT IF EXISTS "CashCustodyMovement_session_tenant_fkey";
ALTER TABLE "CashCollection" DROP CONSTRAINT IF EXISTS "CashCollection_session_tenant_fkey";
ALTER TABLE "CashCollection" DROP CONSTRAINT IF EXISTS "CashCollection_reverser_tenant_fkey";

ALTER TABLE "CashCustodyMovement"
  ADD CONSTRAINT "CashCustodyMovement_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
