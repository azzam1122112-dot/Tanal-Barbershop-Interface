# XMANSX backup and restore

Production backups use PostgreSQL custom format, are validated with `pg_restore --list`, encrypted with `age`, checksummed, and written with owner-only permissions. Keep `BACKUP_AGE_IDENTITY` offline and outside the application host; the application only receives the public `BACKUP_AGE_RECIPIENT`.

Install `postgresql-client` and `age`, set `BACKUP_DIR`, `DATABASE_URL`, `BACKUP_AGE_RECIPIENT`, and `BACKUP_RETENTION_DAYS` in the root-readable service environment, then enable `tanal-backup.timer`. The default local retention is 30 days (accepted range: 1–365), and the backup script only deletes matching XMANSX backup artifacts inside the explicit absolute backup directory. Configure the same or a shorter lifecycle on every immutable/off-site replica; an external replica can otherwise retain data beyond the published policy.

A restore drill must target a newly-created, empty database whose name ends with `_restore_test` or `_restore_drill`. The script refuses any other target and never drops or overwrites a database:

```bash
BACKUP_FILE=/secure/xmansx.dump.age \
BACKUP_AGE_IDENTITY=/secure/backup-identity.txt \
RESTORE_DATABASE_URL='postgresql://.../xmansx_restore_drill' \
./deploy/backup/tanal-restore-drill.sh
```

Run a restore drill at least quarterly and record its date, encrypted artifact checksum, migration count, duration, operator, and the follow-up application smoke-test result. Never put database URLs or identity keys in the drill record.

## Current production state

The last read-only host inspection on 12 August 2026 confirmed that
`tanal-backup.timer` was enabled and active, the service pointed at the versioned
`deploy/backup/tanal-backup.sh`, and recent `.dump.age` plus checksum artifacts
were present. This closes the earlier unencrypted-script divergence recorded on
11 August.

The following launch gates are still operational, not code claims:

- prove that a recent encrypted production/staging artifact restores on an
  isolated database and passes an application smoke test;
- prove immutable/off-site replication and record the owner, RPO, and RTO;
- review the legacy `tanal.env.*` artifact found in the backup directory. Do not
  read it into logs or delete it without operator approval; verify restrictive
  permissions, remove it through the approved secret-handling procedure, and
  rotate affected credentials if its custody cannot be proven;
- alert on timer failure, missing daily artifact, checksum failure, and retention
  cleanup failure.

Do not describe production backup as launch-ready until these gates have
evidence. A running timer is necessary but is not a restore guarantee.
