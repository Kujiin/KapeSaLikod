#!/usr/bin/env bash
# Explicit live upgrade: private backup, guarded migration 004, read-only verification.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo; no passwords belong in this script.' >&2; exit 1; }
repo_dir=$(cd -- "$(dirname -- "$0")/../../.." && pwd)
stage=$(mktemp -d /var/tmp/kape-order-upgrade.XXXXXXXX)
trap 'rm -rf -- "$stage"' EXIT
chmod 0755 "$stage"
install -d -m 0755 "$stage/apps/api/scripts" "$stage/apps/api/db/migrations"
install -m 0644 "$repo_dir/apps/api/scripts/database.py" "$repo_dir/apps/api/scripts/backup.py" "$stage/apps/api/scripts/"
install -m 0644 "$repo_dir"/apps/api/db/migrations/00[1-4]_*.sql "$stage/apps/api/db/migrations/"
install -d -o postgres -g postgres -m 0700 /var/backups/kape-sa-likod
backup_path="/var/backups/kape-sa-likod/before-order-numbers-$(date -u +%Y%m%dT%H%M%S)-$(basename "$stage").dump"
runuser -u postgres -- python3 "$stage/apps/api/scripts/backup.py" "$backup_path"
runuser -u postgres -- pg_restore --list "$backup_path" >/dev/null
runuser -u postgres -- python3 "$stage/apps/api/scripts/database.py" migrate --through 004 --socket-dir /var/run/postgresql --approve-write
expected_sha=$(sha256sum "$stage/apps/api/db/migrations/004_order_numbers.sql")
expected_sha=${expected_sha%% *}
runuser -u postgres -- env -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGSERVICE -u PGSERVICEFILE -u PGOPTIONS \
  psql -X --no-password --host=/var/run/postgresql --port=5432 --username=postgres --dbname=kape_sa_likod \
  --set=ON_ERROR_STOP=1 --set=expected_sha="$expected_sha" <<'SQL'
SELECT count(*) = 4 AND bool_and(CASE WHEN version='004_order_numbers.sql' THEN sha256=:'expected_sha' ELSE true END)
       AND count(*) FILTER (WHERE version='004_order_numbers.sql')=1 AS verified
FROM kape.schema_migrations \gset
\if :verified
\else
  \echo 'Migration ledger verification failed.'
  SELECT 1/0;
\endif
SELECT version, sha256 FROM kape.schema_migrations ORDER BY version;
SELECT (SELECT count(*) FROM kape.categories) AS categories,
       (SELECT count(*) FROM kape.product_sizes) AS sizes,
       (SELECT count(*) FROM kape.products) AS products,
       (SELECT count(*) FROM kape.product_variants) AS variants;
SELECT last_value, is_called FROM kape.order_reference_seq;
SQL
printf 'Migration 004 verified. Backup: %s\nNew orders now use KapeSaLikod-0000001 format. Existing orders are preserved.\n' "$backup_path"
