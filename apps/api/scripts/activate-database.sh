#!/usr/bin/env bash
# Run manually from the reviewed checkout in an authenticated SSH terminal.
# Does not provision, configure authentication/networking, or install a service.
set -euo pipefail
if [[ ${1:-} != --approve-migrations-and-initial-menu ]]; then
  echo 'Review the code and pass --approve-migrations-and-initial-menu to write the dedicated database.' >&2
  exit 2
fi
api_dir=$(cd -- "$(dirname -- "$0")/.." && pwd)
# Complete sudo authentication before staging anything. Never accept a password argument.
sudo -v
sudo -u postgres psql -X -w -h /var/run/postgresql -p 5432 -U postgres -d kape_sa_likod -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
DO $$ BEGIN
 IF current_database() <> 'kape_sa_likod' OR inet_server_addr() IS NOT NULL OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999 THEN
   RAISE EXCEPTION 'Unexpected database, network transport, or PostgreSQL version';
 END IF;
 IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'kape_sa_likod_owner' THEN
   RAISE EXCEPTION 'Unexpected database owner';
 END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('kape_sa_likod_owner','kape_sa_likod_app') AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) <> 2 THEN
   RAISE EXCEPTION 'Required restricted roles not found';
 END IF;
 IF pg_has_role('kape_sa_likod_app','kape_sa_likod_owner','MEMBER') THEN
   RAISE EXCEPTION 'Application role must not be a member of the owner role';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname='kape' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname='kape_sa_likod_owner')) THEN
   RAISE EXCEPTION 'Expected provisioned schema not found';
 END IF;
 IF to_regclass('kape.schema_migrations') IS NULL AND EXISTS (SELECT FROM pg_tables WHERE schemaname='kape') THEN
   RAISE EXCEPTION 'Partial/untracked schema; inspect instead of applying migrations';
 END IF;
END $$;
COMMIT;
SQL
activation_dir=$(mktemp -d /tmp/kape-sa-likod-activation.XXXXXXXX)
sudo chown postgres:postgres "$activation_dir"
trap 'sudo -n -u postgres rm -rf -- "$activation_dir"' EXIT
tar -C "$api_dir" -cf - scripts/database.py db/migrations db/seeds | sudo -u postgres tar -C "$activation_dir" -xf -
# Runner checks existing ledger checksums; all pending migrations commit together.
sudo -u postgres python3 "$activation_dir/scripts/database.py" migrate --through 003 --socket-dir /var/run/postgresql --port 5432 --approve-write
catalog_state=$(sudo -u postgres psql -X -w -At -h /var/run/postgresql -p 5432 -U postgres -d kape_sa_likod -v ON_ERROR_STOP=1 -c 'SELECT (SELECT count(*) FROM kape.categories) + (SELECT count(*) FROM kape.product_sizes) + (SELECT count(*) FROM kape.products) + (SELECT count(*) FROM kape.product_variants)')
if [[ "$catalog_state" == 0 ]]; then
  sudo -u postgres python3 "$activation_dir/scripts/database.py" seed --socket-dir /var/run/postgresql --port 5432 --approve-write --require-empty
else
  echo 'Catalog already contains data; seed skipped. Inspect counts and menu before proceeding.'
fi
sudo -u postgres psql -X -w -h /var/run/postgresql -p 5432 -U postgres -d kape_sa_likod -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SELECT (SELECT count(*) FROM kape.categories) categories,
 (SELECT count(*) FROM kape.product_sizes) sizes,
 (SELECT count(*) FROM kape.products) products,
 (SELECT count(*) FROM kape.product_variants) variants,
 (SELECT count(*) FROM kape.schema_migrations) migrations;
SELECT version,sha256 FROM kape.schema_migrations ORDER BY version;
DO $$ BEGIN
 IF (SELECT count(*) FROM kape.categories) <> 3 OR (SELECT count(*) FROM kape.product_sizes) <> 2
 OR (SELECT count(*) FROM kape.products) <> 21 OR (SELECT count(*) FROM kape.product_variants) <> 37
 OR (SELECT count(*) FROM kape.schema_migrations) <> 3 THEN
   RAISE EXCEPTION 'Initial catalog/migration counts differ; inspect without overwriting data';
 END IF;
END $$;
COMMIT;
SQL
