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

## Production acceptance gates

Before launch, operations must run the same drill against a recent encrypted staging backup, verify an application smoke test, copy the encrypted archive to immutable off-site storage, monitor the systemd timer, and document RPO/RTO ownership. A backup is not considered valid until a restore has succeeded.
