-- The deployed D1 database was patched with this column before migration tracking was initialized.
-- Fresh databases receive it from 0001_initial.sql; keep this migration idempotent.
SELECT 1;
