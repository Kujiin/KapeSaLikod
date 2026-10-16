#!/usr/bin/env python3
"""Test only a temporary PostgreSQL 18 cluster, never the installed live cluster."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

API = Path(__file__).resolve().parents[2]
BIN = Path('/usr/lib/postgresql/18/bin')
ENV = {k: v for k, v in os.environ.items() if not k.startswith('PG')}


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], env=ENV, text=True,
                          capture_output=True, **kwargs)


def require(result):
    if result.returncode:
        raise AssertionError(result.stderr + result.stdout)
    return result.stdout


def main():
    if os.geteuid() == 0:
        raise SystemExit('Run as an ordinary user; do not use sudo or the live postgres account.')
    with tempfile.TemporaryDirectory(prefix='ksl-pg-test-') as temp:
        root = Path(temp)
        data = root / 'data'
        socket = root / 'socket'
        socket.mkdir(mode=0o700)
        require(run([BIN / 'initdb', '-D', data, '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']))
        started = False
        try:
            require(run([BIN / 'pg_ctl', '-D', data, '-l', root / 'postgres.log', '-o',
                         f"-k {socket} -p 55432 -c listen_addresses='' -c unix_socket_permissions=0700", '-w', 'start']))
            started = True
            base = [BIN / 'psql', '-X', '-w', '-h', socket, '-p', '55432', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']
            def sql(statement, ok=True):
                result = run(base + ['-d', 'kape_sa_likod', '-At', '-c', statement])
                if ok:
                    return require(result)
                assert result.returncode != 0, 'Expected statement to fail: ' + statement
            provision = base + ['-d', 'postgres', '-f', API / 'db/provision.sql']
            assert run(provision).returncode != 0
            require(run(provision + ['-v', 'approve_provision=true']))
            assert run(provision + ['-v', 'approve_provision=true']).returncode != 0
            runner = ['python3', API / 'scripts/database.py']
            options = ['--socket-dir', socket, '--port', '55432', '--through', '002']
            assert run(runner + ['migrate'] + options).returncode != 0
            for action in ['migrate', 'migrate', 'seed', 'seed']:
                require(run(runner + [action] + options + ['--approve-write']))
            assert sql('SELECT count(*) FROM kape.schema_migrations').strip() == '2'
            source = (API.parent / 'kiosk/public/script.js').read_text()
            rows = re.findall(r"\{ name: '([^']+)', category: '([^']+)', prices: \[([^\]]+)\]", source)
            expected = sorted((name, cat, size, int(price.strip()) * 100)
                              for name, cat, prices in rows
                              for size, price in zip([12, 16] if ',' in prices else [16], prices.split(',')))
            actual = json.loads(sql("SELECT json_agg(x) FROM (SELECT p.name, c.name AS category, s.ounces, v.price_centavos FROM kape.products p JOIN kape.categories c ON c.id=p.category_id JOIN kape.product_variants v ON v.product_id=p.id JOIN kape.product_sizes s ON s.id=v.size_id) x"))
            assert sorted((r['name'], r['category'], r['ounces'], r['price_centavos']) for r in actual) == expected
            assert len(rows) == 21 and len(actual) == 37
            assert sql("SELECT count(*) FROM pg_roles WHERE rolname='kape_sa_likod_app' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls").strip() == '1'
            assert sql("SELECT count(*) FROM pg_authid WHERE rolname='kape_sa_likod_app' AND rolpassword IS NULL").strip() == '1'
            for statement in [
                'SELECT * FROM kape.admin_users',
                'SELECT * FROM kape.admin_sessions',
                "UPDATE kape.products SET name='tampered'",
                'DELETE FROM kape.order_items',
                'UPDATE kape.orders SET total_centavos=0',
                'CREATE TABLE kape.forbidden(id int)',
                'CREATE TABLE public.forbidden(id int)',
                'CREATE TEMP TABLE forbidden(id int)',
                'SET ROLE kape_sa_likod_owner',
                "INSERT INTO kape.payments(order_id, method, amount_centavos) VALUES(gen_random_uuid(),'cash',1)",
            ]:
                sql('SET SESSION AUTHORIZATION kape_sa_likod_app; ' + statement, ok=False)
            sql('SET ROLE kape_sa_likod_app; SELECT * FROM kape.products;')
            order = """BEGIN; SET LOCAL ROLE kape_sa_likod_app;
INSERT INTO kape.orders(id, order_type, total_centavos) VALUES ('00000000-0000-0000-0000-000000000001', 'Dine In', 15000);
INSERT INTO kape.order_items(order_id, variant_id, product_name, category_name, size_label, unit_price_centavos, quantity)
SELECT '00000000-0000-0000-0000-000000000001', v.id, p.name, c.name, s.label, v.price_centavos, 2
FROM kape.product_variants v JOIN kape.products p ON p.id=v.product_id JOIN kape.categories c ON c.id=p.category_id JOIN kape.product_sizes s ON s.id=v.size_id WHERE p.name='Signature Choco' AND s.ounces=12;
COMMIT;"""
            sql(order)
            sql("BEGIN; SET LOCAL ROLE kape_sa_likod_app; INSERT INTO kape.orders(order_type,total_centavos) VALUES ('Dine In', 0); COMMIT", ok=False)
            sql("BEGIN; UPDATE kape.orders SET total_centavos=1; COMMIT", ok=False)
            sql("UPDATE kape.order_items SET quantity=0", ok=False)
            sql("INSERT INTO kape.product_variants(product_id,size_id,price_centavos) SELECT product_id,size_id,-1 FROM kape.product_variants LIMIT 1", ok=False)
            sql("UPDATE kape.product_variants SET price_centavos=price_centavos+100")
            assert sql('SELECT total_centavos FROM kape.orders').strip() == '15000'
            assert sql('SELECT unit_price_centavos FROM kape.order_items').strip() == '7500'
            assert run(runner + ['seed'] + options + ['--approve-write']).returncode != 0
            sql("UPDATE kape.schema_migrations SET sha256=repeat('0',64) WHERE version='001_catalog.sql'")
            assert run(runner + ['migrate'] + options + ['--approve-write']).returncode != 0
            print('PASS: isolated PostgreSQL 18 provisioning guards, migration/seed reruns, checksums, exact 21 products/37 variants, permissions, order totals, immutable price snapshots, seed refusal after orders.')
        finally:
            if started:
                require(run([BIN / 'pg_ctl', '-D', data, '-m', 'immediate', '-w', 'stop']))


if __name__ == '__main__':
    main()
