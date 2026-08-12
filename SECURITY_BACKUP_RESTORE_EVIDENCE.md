# XMANSX Backup / Restore Evidence

## Drill record — 2026-08-10 (Asia/Riyadh)

- Scope: local isolated PostgreSQL databases only; no production connection or customer data.
- Source: `tanal_security_hardening_20260810_0915` (fresh migrations, synthetic/empty data).
- Restore target: `tanal_security_hardening_restore_drill_v3` (new empty database; source not modified).
- PostgreSQL tool/server family: 16 (`postgres:16-alpine`).
- Backup format: PostgreSQL custom archive, compression level 9, no ownership or ACL restoration.
- Archive structural validation: passed (`pg_restore --list`).
- Restore mode: `--exit-on-error --no-owner --no-acl`.
- Completed migrations after restore: 37.
- Validated composite tenant constraints after restore: 56.
- Security/tenant triggers after restore: 3.
- Restore duration: 2.51 seconds.
- Archive SHA-256: `CD93FFEEBBDAB5DD32AFCA21497D89E09D47AA64AC5E7EB289F31D49CD4CC63F`.
- Result: PASS.

The final local drill archive contains no real personal data and remains outside the repository at `%TEMP%\XMANSX-security-drill-20260810-v3\isolated-security-backup.dump`; it was deliberately not deleted. Production automation in `deploy/backup` adds `age` encryption before storage and requires a separate offline identity for recovery.

## Drill record — 2026-08-12 (Asia/Riyadh)

- Scope: local isolated PostgreSQL 15 databases only; no production connection or customer data.
- Source: `tanal_readiness_final_test_20260812`, created from all current migrations and synthetic seed data.
- Restore target: `tanal_readiness_restore_drill_20260812`, newly created and empty.
- Backup format: PostgreSQL custom archive, no ownership or ACL restoration.
- Archive structural validation: PASS (`pg_restore --list`).
- Restore mode: `--exit-on-error --no-owner --no-acl`.
- Completed migrations after restore: 57.
- Composite tenant constraints after restore: 75.
- Application security/tenant triggers in the restored source: 4.
- End-to-end dump, restore, validation, and cleanup duration: 17.1 seconds.
- Archive SHA-256 prefix recorded during the drill: `69145498A094`.
- Result: PASS.
- Cleanup: the isolated restore database and temporary dump were deleted after validation; the source test database was not modified.

This proves the repository migration set and PostgreSQL custom-format restore path
locally. It does **not** prove decryption of the latest production `.dump.age`,
off-site availability, production RPO/RTO, or an application smoke test against a
restored production-like artifact.

### Subsequent fresh-database verification — 2026-08-12

After concurrent uncommitted stock/supply migrations appeared in the shared
working tree, a second empty candidate database was created and all 59 migration
directories deployed successfully. `prisma migrate status` reported the database
up to date, Prisma Client generation succeeded, and three consecutive full suites
each passed 83 files / 547 tests. Schema drift was limited to the 79 manual
composite tenant constraints and 11 manual composite unique indexes already
expected from the isolation design; no other statement remained.

The frozen production-readiness commit deliberately excludes those concurrent
features. Its independent clean-worktree verification applied all 57 migrations,
generated Prisma Client, passed typecheck/lint/build under Node 22.22.3, and
completed three consecutive suites of 81 files / 533 tests. Its drift contained
only 71 manual composite tenant constraints and the same 11 manual composite
unique indexes.

This is migration/test evidence, not a second restore claim. The restore drill
above covers the earlier 57-migration snapshot. The exact frozen release commit
must receive its own encrypted-artifact restore evidence before launch.

## Production acceptance gates

Before launch, operations must run the same drill against a recent encrypted staging backup, verify an application smoke test, copy the encrypted archive to immutable off-site storage, monitor the systemd timer, and document RPO/RTO ownership. A backup is not considered valid until a restore has succeeded.
