#!/usr/bin/env python3
"""Run PostgreSQL + API + browser tests against an isolated socket-only cluster."""
import os
from pathlib import Path
import subprocess
import tempfile
from bootstrap import bootstrap

API = Path(__file__).resolve().parents[1]
BIN = Path('/usr/lib/postgresql/18/bin')
ENV = {k: v for k,v in os.environ.items() if not k.startswith('PG')}


def checked(command, **kwargs):
    return subprocess.run([str(a) for a in command], env=ENV, check=True, **kwargs)


def main():
    if os.geteuid() == 0:
        raise SystemExit('Run without sudo; this creates only a private disposable cluster.')
    with tempfile.TemporaryDirectory(prefix='ksl-integration-') as temp:
        root=Path(temp); socket=root/'socket'; socket.mkdir(mode=0o700)
        data=root/'pgdata'
        checked([BIN/'initdb','-D',data,'-U','postgres','--auth-local=trust','--auth-host=reject','--no-locale','--encoding=UTF8'],stdout=subprocess.DEVNULL)
        started=False
        try:
            checked([BIN/'pg_ctl','-D',data,'-l',root/'postgres.log','-o',f"-k {socket} -p 55433 -c listen_addresses='' -c unix_socket_permissions=0700",'-w','start'],stdout=subprocess.DEVNULL)
            started=True
            checked([BIN/'psql','-X','-w','-h',socket,'-p','55433','-U','postgres','-d','postgres','-v','approve_provision=true','-f',API/'db/provision.sql'],stdout=subprocess.DEVNULL)
            for action in ['migrate','migrate','seed']:
                checked(['python3',API/'scripts/database.py',action,'--socket-dir',socket,'--port','55433','--approve-write','--require-empty'],stdout=subprocess.DEVNULL)
            ENV.update(PGHOST=str(socket),PGPORT='55433',PGUSER='kape_sa_likod_app',PGDATABASE='kape_sa_likod',UPLOAD_DIR=str(root/'uploads'),ALLOWED_ORIGINS='http://127.0.0.1:4173')
            bootstrap(API,ENV)
            # Reset only the bootstrap fixture in this disposable cluster.
            checked([BIN/'psql','-X','-w','-h',socket,'-p','55433','-U','postgres','-d','kape_sa_likod','-v','ON_ERROR_STOP=1','-c',"DELETE FROM kape.audit_events WHERE actor_admin_id IN (SELECT id FROM kape.admin_users WHERE email='bootstrap@example.test'); DELETE FROM kape.admin_users WHERE email='bootstrap@example.test';"],stdout=subprocess.DEVNULL)
            checked(['node','--test','--test-concurrency=1',API/'tests/api.test.js'],cwd=API)
            checked(['node','--test',API/'tests/frontend.test.js'],cwd=API)
            # Restore a private backup into a separate disposable database.
            dump=root/'restore-check.dump'
            with dump.open('wb') as output:
                os.chmod(dump,0o600)
                checked([BIN/'pg_dump','-w','-h',socket,'-p','55433','-U','postgres','-d','kape_sa_likod','-Fc','--no-owner'],stdout=output)
            checked([BIN/'createdb','-w','-h',socket,'-p','55433','-U','postgres','-O','kape_sa_likod_owner','kape_restore_check'])
            checked([BIN/'pg_restore','-w','-h',socket,'-p','55433','-U','postgres','-d','kape_restore_check','--role=kape_sa_likod_owner','--no-owner','--exit-on-error','--single-transaction',dump],stdout=subprocess.DEVNULL)
            checked([BIN/'psql','-X','-w','-h',socket,'-p','55433','-U','postgres','-d','kape_restore_check','-v','ON_ERROR_STOP=1','-c',"DO $$ BEGIN IF (SELECT count(*) FROM kape.schema_migrations) <> 3 OR NOT EXISTS (SELECT FROM kape.orders) THEN RAISE EXCEPTION 'Restore validation failed'; END IF; END $$;"],stdout=subprocess.DEVNULL)
            print('PASS: private custom-format backup restored transactionally into a separate disposable database.')
            if '--browser' in os.sys.argv:
                checked(['node','--test',API/'tests/browser.test.js'],cwd=API)
        finally:
            if started:checked([BIN/'pg_ctl','-D',data,'-m','immediate','-w','stop'],stdout=subprocess.DEVNULL)


if __name__=='__main__':
    main()
