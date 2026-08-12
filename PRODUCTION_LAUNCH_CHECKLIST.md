# XMANSX production launch checklist

No production deployment or production migration is authorized by this document.
Every item needs dated evidence and an accountable operator.

## 1. Freeze and source control

- [ ] Freeze product changes; no feature work enters the release candidate.
- [ ] Resolve or separately approve the concurrent stock-report and supply work and their migrations.
- [ ] Confirm `git status` is clean after the intended release commit.
- [ ] Confirm the release commit passed CI and security scanning.
- [ ] Record release commit SHA and rollback commit/release.

## 2. Runtime environment

- [x] Node is exactly the version declared by `.node-version` / `.nvmrc` (22.22.3 verified on Production, 2026-08-12).
- [x] `DATABASE_URL`, Redis, email, session, OTP, WebAuthn, MFA, maintenance, and public-origin variables are `SET` and validated.
- [x] `SESSION_SECRET` and `CUSTOMER_OTP_PEPPER` are independent secrets of at least 32 bytes.
- [x] `WEBAUTHN_RP_NAME`, `WEBAUTHN_RP_ID`, and `WEBAUTHN_ORIGIN` match the approved production domain strategy.
- [x] `REQUIRE_EXPLICIT_SEED_CREDENTIALS=true`; seed is not part of production launch.
- [x] No secret appears in the reviewed Git release scope or audit outputs.
- [x] `/api/health/readiness` returned HTTP 200 after dependency/configuration validation.

## 3. Email

- [x] Resend uses named, separate production-sending and inbound-processing keys; `EMAIL_FROM` uses the verified XMANSX domain.
- [x] SPF, DKIM, and DMARC are verified from the actual sending-domain configuration.
- [ ] Deliver one verification OTP, one login OTP, and one password reset to approved test inboxes.
- [ ] Confirm Arabic RTL rendering, correct subject/tag, ten-minute expiry text, and no localhost/stack trace.
- [x] Confirm delivery, bounce, complaint, and provider-failure visibility in Resend; a recent message showed `sent` and `delivered` events.

## 4. Database and migrations

- [ ] Back up production immediately before the release window.
- [ ] Verify the encrypted artifact checksum and off-site copy.
- [ ] Run `prisma migrate status` against the release candidate and production before change.
- [ ] Apply only `prisma migrate deploy`; never `migrate reset` or `db push` in production.
- [ ] Confirm all release migrations finished and no unexpected drift exists.
- [ ] Run database/readiness smoke checks after migration.

## 5. Authentication and isolation

- [ ] Verify customer/staff/platform cookie flags over HTTPS.
- [ ] Re-run customer/staff route isolation, CSRF Origin, rate-limit, tenant, and IDOR tests.
- [ ] Verify registration, email verification, password login/reset, logout, and session rotation.
- [ ] Verify passkey registration/login/cancel/fallback/add/revoke on at least one real device before launch.
- [ ] Verify revoked credentials and disabled accounts cannot authenticate.

## 6. Loyalty and wallet

- [ ] Organization A: earn +100, +200, +50 from three branches; organization balance is 350.
- [ ] Redeem in a different branch; one organization ledger changes with correct branch attribution.
- [ ] Join organization B; balances remain independent.
- [ ] Confirm movement attribution, balance before/after, actor, idempotency, and concurrency behavior.
- [ ] Confirm wallet pagination and a foreign loyalty reference returns 404/denial.

## 7. Manual E2E journeys

- [ ] Journey A: QR/join → register → OTP → verify → enroll → passkey → wallet → logout → passkey login → wallet.
- [ ] Journey B: cancel/unavailable passkey → email → login OTP → wallet.
- [ ] Journey C: join a second organization → two independent wallet cards.
- [ ] Journey D: earn at branches 1/2, redeem at branch 3 → one organization balance and correct activity attribution.

## 8. Real-device matrix

For each of iPhone Safari, Android Chrome, and Windows Edge/Chrome:

- [ ] Register passkey.
- [ ] Logout.
- [ ] Login with passkey.
- [ ] Cancel the passkey prompt.
- [ ] Complete email OTP fallback.
- [ ] Add a second passkey.
- [ ] Revoke a passkey and verify it no longer works.

## 9. Backup, monitoring, and rollback

- [x] Encrypted PostgreSQL backup timer is active; latest checksum verified.
- [x] Hetzner automatic disk backups are enabled and recent images are `Available`.
- [x] Two-minute readiness monitor is installed, enabled, and its success path passed.
- [ ] Restore the newest encrypted production/staging backup into an isolated database.
- [ ] Run an application smoke test against the restored database.
- [ ] Record backup owner, immutable/off-site location, RPO, RTO, and restore duration.
- [ ] Configure alerts for HTTP 500, email failures, OTP/passkey failures, P2034 exhaustion, migration failure, readiness failure, and backup failure.
- [ ] Verify rollback procedure for application code; database rollback uses forward fixes unless a reviewed reversible migration exists.

## 10. Launch sequence

1. Freeze and tag the approved commit.
2. Confirm CI/security scans and the three stable full test runs.
3. Complete email DNS/delivery and real-device passkey evidence.
4. Produce and verify encrypted backup plus off-site copy.
5. Enter maintenance/release window and verify pre-migration health.
6. Apply `prisma migrate deploy` once.
7. Deploy the exact approved commit with validated environment values.
8. Verify health/readiness, login, email OTP, passkey, wallet, tenant isolation, and key staff routes.
9. Monitor errors, email delivery, Redis, database, and backup signals through the observation window.
10. Close the window only after evidence is attached; otherwise execute the approved rollback/forward-fix plan.
