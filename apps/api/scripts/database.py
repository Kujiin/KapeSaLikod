#!/usr/bin/env python3
"""Explicitly approved local-socket migrations/seeds; no dependencies or passwords."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1] / 'db'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['migrate', 'seed'])
    parser.add_argument('--socket-dir', required=True, type=Path)
    parser.add_argument('--port', type=int, default=5432)
    parser.add_argument('--approve-write', action='store_true')
    parser.add_argument('--through', choices=['002', '003', '004'], default='004')
    parser.add_argument('--require-empty', action='store_true', help='Refuse seed if any catalog table contains rows')
    args = parser.parse_args()
    if not args.approve_write:
        parser.error('writes require --approve-write after explicit approval')
    if not args.socket_dir.is_absolute() or not args.socket_dir.is_dir():
        parser.error('socket directory must be an existing absolute local path')
    if not 1 <= args.port <= 65535:
        parser.error('invalid port')
    # Ignore ambient connection/service/psql configuration. Never accept a URL.
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    sql = r"""\set ON_ERROR_STOP on
BEGIN;
SELECT current_database() = 'kape_sa_likod' AND inet_server_addr() IS NULL
       AND current_user = 'postgres' AS target_ok \gset
\if :target_ok
\else
  \echo 'Refusing unexpected database, user, or TCP connection.'
  SELECT 1 / 0; -- ON_ERROR_STOP: abort the script with a nonzero exit
\endif
SET LOCAL ROLE kape_sa_likod_owner;
SET LOCAL search_path = pg_catalog, kape;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(180018, 210037);
"""
    if args.action == 'migrate':
        sql += """CREATE TABLE IF NOT EXISTS kape.schema_migrations (
 version text PRIMARY KEY, sha256 text NOT NULL CHECK (length(sha256) = 64),
 applied_at timestamptz NOT NULL DEFAULT now());
"""
        for path in sorted((ROOT / 'migrations').glob('[0-9][0-9][0-9]_*.sql')):
            if path.name[:3] > args.through:
                continue
            content = path.read_bytes()
            version = literal(path.name)
            checksum = literal(hashlib.sha256(content).hexdigest())
            sql += rf"""SELECT EXISTS (SELECT FROM kape.schema_migrations WHERE version = {version}) AS applied,
 EXISTS (SELECT FROM kape.schema_migrations WHERE version = {version} AND sha256 <> {checksum}) AS changed \gset
\if :changed
  \echo 'Refusing changed applied migration: {path.name}'
  SELECT 1 / 0; -- ON_ERROR_STOP: abort the script with a nonzero exit
\endif
\if :applied
\else
{content.decode()}
INSERT INTO kape.schema_migrations(version, sha256) VALUES ({version}, {checksum});
\endif
"""
    else:
        if args.require_empty:
            sql += "DO $$ BEGIN IF EXISTS (SELECT FROM kape.products) OR EXISTS (SELECT FROM kape.categories) OR EXISTS (SELECT FROM kape.product_sizes) OR EXISTS (SELECT FROM kape.product_variants) THEN RAISE EXCEPTION 'Catalog is not empty; inspect instead of overwriting'; END IF; END $$;\n"
        sql += (ROOT / 'seeds' / 'development.sql').read_text()
    sql += '\nCOMMIT;\n'
    subprocess.run(['psql', '-X', '--no-password', '--host', str(args.socket_dir),
                    '--port', str(args.port), '--username', 'postgres',
                    '--dbname', 'kape_sa_likod'], input=sql, text=True, env=env,
                   check=True)


if __name__ == '__main__':
    main()
