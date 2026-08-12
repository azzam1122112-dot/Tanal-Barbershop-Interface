# XMANSX production readiness report

Audit date: 12 August 2026 (Asia/Riyadh)

Scope: production readiness, security, configuration, migrations, build, and pre-launch verification only.

Production deployment or production migration: **not performed**.

## A — Overall status

**NOT READY**

The code-level gates are green, but launch acceptance is blocked by missing production customer-auth configuration, unproved live email delivery/DNS, no real-device passkey evidence, and no restore proof for a recent encrypted production/staging artifact. The shared working tree also received concurrent uncommitted stock/supply feature work during this audit, so a release freeze and an approved immutable commit are still required.

## B — Authentication

- Email OTP: 6 digits; HMAC-SHA256 with `CUSTOMER_OTP_PEPPER`; only the digest is stored; expiry, attempt limits, rate limits, resend invalidation, atomic consumption, and timing-safe comparison are covered by regression tests. Verification, login, and password-reset purposes are separate.
- Passkey: registration/authentication challenges expire and are consumed once atomically. Credential ownership, credential-ID uniqueness, RP/origin checks, revocation, signature counter, and session rotation are enforced. Counter advancement was hardened against concurrent stale writes.
- Password fallback: retained and tested; it was not removed or weakened.
- CustomerSession: opaque hashed tokens with expiry and rotation. The customer cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`, path `/`, and cannot authorize staff/platform routes.
- Staff/customer isolation: automated route/session tests pass; visual redirects also separated `/account`, `/dashboard`, `/barber`, `/platform`, and `/receipt` while unauthenticated.
- CSRF: mutating `/api/account/**` requests now fail closed when `Origin` is absent or unapproved. WebAuthn origin validation remains separate.
- Rate limiting: IP and identifier-oriented limits exist for register/login/OTP/reset/passkey/enrollment paths; Redis is required by production configuration.

## C — Email

- Provider: Resend is selected when the production key is present; no key is hardcoded.
- Production configuration: provider key/from/reply-to/webhook secret are set, but the provider-selection variable is omitted by design and auto-detected.
- DNS: **PASS** for public records. SPF exists on the Resend sending subdomain, DKIM exists on the Resend selector, and DMARC exists on the apex. The authenticated Resend tab identifies `xmansx.com` as verified.
- Templates: Arabic/RTL XMANSX templates exist for verification OTP, login OTP, and password reset; expiry is stated and no localhost/stack trace placeholder was found. Login OTP now has its own subject/tag.
- Logging: development console delivery no longer logs recipient, subject, body, or OTP.
- Delivery test: **NOT TESTED**. No real email was sent without an explicitly approved test recipient/window.

## D — WebAuthn

- Required production target: RP name `XMANSX`, RP ID `xmansx.com`, primary origin `https://xmansx.com`; the implementation also permits the reviewed `https://www.xmansx.com` origin.
- Production environment state: the three explicit WebAuthn variables are missing; readiness now fails closed in production when they or the independent session/OTP secrets are invalid.
- Hardening: `residentKey=required`, `userVerification=required`, and verification requires user verification. There is no silent downgrade to `preferred`.
- HTTPS: **PASS** for the live edge. HTTP redirects to HTTPS, HSTS/CSP are present, the certificate matches `xmansx.com`, and it had 87 days remaining at inspection. Live end-to-end passkey behavior was not exercised.
- Biometrics: no biometric material is stored; only WebAuthn credential public material and metadata are stored.
- Device test: **NOT TESTED**.

## E — Loyalty

- Scope: one LoyaltyAccount per organization/customer enrollment; branch/salon remains transaction attribution only.
- Multi-branch: automated regression covers +100, +200, +50 across branches and verifies a single balance of 350, then redemption in another branch.
- Multi-organization: the same CustomerAccount sees independent organization balances with no aggregation.
- Ledger: approved changes flow through `recordLoyaltyMovement`; movements retain branch, before/after balances, and actor attribution.
- Concurrency/idempotency: earn/redeem/reversal/adjustment paths are transactional and regression-tested; no lost update or duplicate movement appeared in the three full runs.

## F — Wallet

- Tenant isolation and IDOR regression tests pass; account ownership is constrained in the query and foreign loyalty references are rejected/not found.
- One organization produces one card; branch activity is distinct while balance stays organization-scoped.
- Transactions are paginated and bounded. Reviewed queries avoid per-row N+1 expansion and private responses are not publicly cached.

## G — Database

- Frozen readiness commit: 57 migration directories; only the historical duplicate timestamp `20260812120000` remains allowlisted and no new collision exists in the commit. Concurrent stock/supply migrations remain outside it, confirming that the shared working tree itself is not frozen.
- Fresh deploy: `prisma migrate deploy` succeeded from an empty isolated database through all 57 migrations in the readiness commit; `prisma migrate status` reported up to date.
- Prisma client: generation succeeded for the fresh candidate. A later retry was temporarily blocked only while a concurrently started development server held the Windows engine file.
- Drift: no new unexpected drift. Remaining diff is exactly 71 manual composite tenant FKs and 11 manual composite unique indexes that Prisma cannot express completely.
- Tenant FK action mismatch: fixed with an idempotent migration that aligns composite FK update/delete actions with their scalar relation while preserving tenant columns.
- Indexes: wallet/auth/ledger/enrollment review found the required scoped/unique indexes; no obvious full-table blocker was introduced.
- Test data: local development data was inventoried; no production deletion or cleanup was performed.
- Production database: no reset, `db push`, migration, or write was performed.

## H — Security

- Secret scan: no environment file, API key, database dump, local database, build artifact, or credential was included in the readiness commit scope. `.claude/` is ignored.
- Logs/errors: password, OTP, session token, passkey challenge, reset token, provider key, raw authorization header, Prisma details, and production stack traces are not intentionally emitted by reviewed paths.
- Debug routes: no `/api/dev`, `/debug`, test-login bypass, or production customer-auth bypass was found. Existing test-email/push endpoints require the appropriate authenticated platform/staff context.
- Headers: HSTS in production, CSP, frame denial, content-type protection, referrer policy, permissions policy, COOP, and no-store API/private-page caching are configured.
- Release safety: the release script now fails closed on the required production configuration and exact Node version, runs the encrypted backup service instead of creating a raw dump, builds before touching the schema, and lets systemd apply migrations immediately before starting the new application.
- Monitoring: a hardened two-minute systemd readiness monitor and throttled Resend alert path are included and regression-tested. Installation and a controlled failure alert on Production remain unproved.
- Private indexing: account, wallet, dashboard, barber, platform, receipt, and legacy customer portal routes are excluded from public indexing; marketing pages remain public.
- Tenant isolation, IDOR, CSRF, rate-limit, and session-separation tests pass.

## I — Build/Test

- `npm run typecheck`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS** under the declared Node 22.22.3, production build in an isolated output directory, 144 static pages/routes processed.
- `npm audit --omit=dev --audit-level=high`: **PASS**, zero reported vulnerabilities.
- Full suite, consecutive run 1: **81 files / 535 tests PASS** on the hardened release candidate.
- Full suite, consecutive run 2: **81 files / 535 tests PASS** on the hardened release candidate.
- Full suite, consecutive run 3: **81 files / 535 tests PASS** on the hardened release candidate.
- No P2034 exhaustion, random failure, skipped test, or retry increase was observed in these runs.
- Because unrelated feature files continued changing afterward, the exact frozen release commit must repeat these gates before launch.

## J — Performance

- Reviewed wallet, loyalty reports, visit confirmation, enrollment, login, OTP, and passkey paths for unbounded lists, N+1 patterns, large relation expansion, and missing scoped indexes.
- Bounded pagination/scoped selection is present on wallet activity and reporting paths.
- Fixed only clear correctness/security issues; no speculative cache or architecture change was introduced.
- Remaining concern: no production-like load test or APM trace was run, so capacity thresholds are not yet evidenced.

## K — Backup/Restore

- Host read-only evidence: encrypted `.dump.age` artifacts/checksums existed and the systemd backup timer was enabled and active at inspection time.
- Local isolated custom-format restore drill: **PASS**; no production data was used and the restored database/dump were cleaned up after validation.
- Production/staging encrypted artifact decryption + isolated restore + application smoke test: **NOT TESTED**.
- Immutable off-site copy, owner, RPO, RTO, and restore duration for production: **NOT PROVEN**.
- A legacy `tanal.env.*` artifact was observed in the backup directory. It was not read or deleted; controlled review and possible credential rotation remain required.

## L — Manual E2E

| Journey | Status | Evidence |
| --- | --- | --- |
| A — new customer through passkey login | NOT TESTED | Login/register/join pages and route redirects were visually inspected; no OTP or passkey ceremony was completed. |
| B — email fallback | NOT TESTED | Fallback UI exists; no real OTP delivery/login was completed. |
| C — second organization | NOT TESTED | Automated isolation/enrollment/wallet tests pass; manual browser journey was not completed. |
| D — branch points | NOT TESTED | Automated 350-point and cross-branch redemption test passes; manual browser journey was not completed. |

## M — Device tests

| Device/browser | Status |
| --- | --- |
| iPhone Safari | NOT TESTED |
| Android Chrome | NOT TESTED |
| Windows Edge/Chrome real passkey ceremony | NOT TESTED |

The per-device register/logout/login/cancel/fallback/add/revoke checklist is in `PRODUCTION_LAUNCH_CHECKLIST.md`.

## N — Environment variables

Only state is shown; secret values are intentionally omitted.

| Variable | Required? | Purpose | Development behavior | Production behavior | Secret? | Production state |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Primary PostgreSQL connection | Local database | Production pool/runtime connection | Yes | SET |
| `DIRECT_URL` | No/currently unused | Direct migration connection when supported | Optional | Recommended if provider requires it | Yes | MISSING |
| `REDIS_URL` | Yes | Distributed rate limits/readiness | Can fall back only when explicitly allowed | Required | Yes | SET |
| `REDIS_REQUIRED` | Yes | Fail-closed Redis policy | May be false | Must be true | No | SET |
| `SESSION_SECRET` | Yes | Signed join/session context | Non-production fallback allowed | Independent >=32-byte secret required | Yes | MISSING |
| `CUSTOMER_OTP_PEPPER` | Yes | OTP HMAC pepper | Required by secure flows | Independent >=32-byte secret required | Yes | SET |
| `EMAIL_PROVIDER` | No | Explicit provider selection | Console/auto | `resend` recommended; auto-selects with key | No | MISSING |
| `RESEND_API_KEY` | Yes | Production delivery | Optional | Required for Resend | Yes | SET |
| `EMAIL_FROM` | Yes | Verified sender identity | Optional/simulated | Verified domain sender required | No | SET |
| `EMAIL_REPLY_TO` | Recommended | Reply mailbox | Optional | Customer support mailbox | No | SET |
| `EMAIL_REQUIRED` | Yes | Fail-closed delivery readiness | May be false | Must be true | No | SET |
| `RESEND_WEBHOOK_SECRET` | Yes when webhook enabled | Verify delivery webhooks | Optional | Required for webhook | Yes | SET |
| `WEBAUTHN_RP_NAME` | Yes | Passkey relying-party label | Safe local default | Explicit `XMANSX` required | No | MISSING |
| `WEBAUTHN_RP_ID` | Yes | Passkey RP scope | Localhost derivation | Explicit approved domain required | No | MISSING |
| `WEBAUTHN_ORIGIN` | Yes | Passkey expected origin | Local origin derivation | Explicit HTTPS origin required | No | MISSING |
| `PUBLIC_APP_URL` | Yes | Canonical application URL | Localhost allowed | Canonical HTTPS URL | No | SET |
| `NEXT_PUBLIC_SITE_URL` | No/current equivalent is `PUBLIC_APP_URL` | Public canonical URL alias | Not used | Not used by reviewed code | No | MISSING |
| `ALLOWED_ORIGINS` | Yes | Origin/CSRF allowlist | Local origins | Approved HTTPS origins only | No | SET |
| `PLATFORM_MFA_ENCRYPTION_KEY` | Yes | Protect platform MFA secret material | Required for MFA testing | Required | Yes | SET |
| `MAINTENANCE_TOKEN` | Yes | Authenticate maintenance endpoint | Optional local execution | Required/rotatable | Yes | SET |
| `REQUIRE_EXPLICIT_SEED_CREDENTIALS` | Yes | Prevent implicit production seed credentials | Optional locally | Must be true | No | MISSING |
| `ROOT_DOMAIN` | Yes | Domain routing/cookies | Local default possible | Explicit production domain | No | SET |
| `LOG_LEVEL` | Recommended | Runtime log threshold | Debug/info | Info/warn per policy | No | SET |

## O — Files changed by this readiness work

- Configuration/docs: `.env.example`, `README.md`, `tsconfig.json`, `PRODUCTION_LAUNCH_CHECKLIST.md`, `PRODUCTION_READINESS_REPORT.md`, `SECURITY_BACKUP_RESTORE_EVIDENCE.md`, `deploy/backup/README.md`.
- Readiness/security: `app/api/health/readiness/route.ts`, `middleware.ts`, `lib/auth/webauthn-config.ts`, `lib/customers/account-challenge.ts`, `lib/customers/join-context.ts`, `lib/customers/passkey-service.ts`, `lib/email/email-provider.ts`.
- Operations: `deploy/release.sh`, `deploy/monitor/tanal-healthcheck.sh`, and `deploy/systemd/tanal-healthcheck.{service,timer}`.
- Database: `prisma/schema.prisma` readiness-only relation/FK metadata and `prisma/migrations/20260812180000_align_tenant_fk_actions/migration.sql`.
- Tests: `tests/customer-passkeys.test.ts`, `tests/deployment-config.test.ts`, `tests/origin.test.ts`, `tests/security-regressions.test.ts`, `tests/tenant-fk-actions.test.ts`.
- Concurrent stock/supply feature files are preserved in the working tree and excluded from the readiness commit.

## P — Commit hash

- Safety checkpoint: `a46143b` (`chore: checkpoint customer account and passkey work`).
- Production-readiness commit: recorded in the final handoff; a commit cannot embed its own final hash in its committed contents.

## Q — Launch blockers

1. Set and validate independent production `SESSION_SECRET` plus explicit WebAuthn RP name/ID/origin.
2. Set `REQUIRE_EXPLICIT_SEED_CREDENTIALS=true` and re-check readiness.
3. Complete approved live verification/login/reset delivery; DNS and Resend domain verification are already proven.
4. Complete at least one real-device passkey journey, then the full device matrix.
5. Restore a recent encrypted production/staging artifact into isolation and prove application smoke, off-site copy, RPO/RTO, and alerting.
6. Freeze feature work and select an immutable release commit; review/merge or explicitly exclude the concurrent stock/supply work.
7. Install the included readiness monitor and prove the controlled failure alert; connect journal event patterns for 500s, email/OTP/passkey failures, exhausted P2034 retries, migration failure, and backup failure to the accountable operator.
8. Run the manual E2E journeys against staging with production-equivalent HTTPS, Redis, email, and WebAuthn configuration.

## R — Recommended launch sequence

1. Freeze the repository and approve the exact release commit; keep stock/supply work outside it unless separately reviewed.
2. Configure missing production variables and validate `/api/health/readiness` without exposing values.
3. Verify email DNS and deliver verification/login/reset messages to approved test inboxes.
4. Deploy the immutable candidate to production-equivalent staging; run Journeys A–D and real-device passkey tests.
5. Produce an encrypted backup, prove checksum/off-site copy, restore it in isolation, and run application smoke tests; record owner/RPO/RTO.
6. Re-run secret scan, migration status/drift, typecheck, lint, three full suites, build, and security checks on the exact approved commit.
7. Open the controlled release window, take a fresh backup, and verify pre-migration health.
8. Run `prisma migrate deploy` once; never reset or `db push` production.
9. Deploy the exact approved commit and verify readiness, OTP, passkey, wallet, tenant isolation, and staff/customer route separation.
10. Monitor through the observation window and close only after evidence is attached; otherwise use the approved rollback/forward-fix procedure.
