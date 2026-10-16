> Historical preparation baseline. The database has since been provisioned manually;
> **do not run provision.sql again**. Migration 003 and the guarded initial menu
> activation procedure are documented in [the current implementation guide](../../../docs/backend-implementation.md).
> The original two-migration baseline below is retained for design context.

# PostgreSQL preparation — no live activation authorized

Prepared for PostgreSQL 18 / Option A. These files do not install an API or change
PostgreSQL configuration. Only the disposable test has been executed. Do not run
provisioning, migrations, or seeds against the installed cluster until approved.

## Proposed schema

All application objects live in `kape`, owned by a NOLOGIN owner role.

| Table | Purpose |
| --- | --- |
| categories | Unique menu categories, ordering, activation |
| product_sizes | Unique size labels and ounces |
| products | Category FK, exact name, image path, ordering, activation |
| product_variants | Unique product/size pair, current integer-centavo price, activation |
| orders | UUID, exact kiosk order type, PHP total, lifecycle status, timestamps |
| order_items | Variant FK, historical product/category/size/price snapshots, quantity, generated line total |
| order_status_events | Future append-only status history and optional staff actor |
| payments | Future cash/external payment records; no card details |
| admin_users | Future staff identities, password hashes, owner/manager/staff authorization roles |
| admin_sessions | SHA-256 token hashes, expiry, revocation; never plaintext tokens |
| audit_events | Future staff actions and JSON metadata; never put secrets in metadata |
| idempotency_keys | UUID request key, SHA-256 request hash, unique resulting order, expiry |
| schema_migrations | Applied filenames, SHA-256 checksums, timestamps |

Foreign keys restrict deletion. Deactivate catalog entries instead of deleting
history. Money uses integer centavos (PHP); totals and multiplication use bigint.
All times are `timestamptz`; confirm the cafe's business timezone before reports or
date-based order numbering. No local-time assumption is embedded in seeds.

Deferred triggers require at least one item and an exact sum of lines at commit.
The total-check function is SECURITY DEFINER, has a fixed pg_catalog search path,
uses qualified table names, and is not executable by PUBLIC or the runtime role.
It locks the header while checking; moving items between orders is prohibited.
Runtime cannot update/delete historical items. Product price edits do not change
past orders. There are no discounts, taxes, refunds, stock, or payment integrations
implemented; review those rules before adding them.

## Privilege boundary

- `kape_sa_likod_owner`: NOLOGIN database/schema owner for controlled migrations.
  Migrations run through local postgres administration and SET ROLE; the API never
  receives postgres or owner credentials.
- `kape_sa_likod_app`: LOGIN with NULL password initially, no ownership, role
  membership, elevated attributes, DDL, temporary tables, or sequence access.
  CONNECT + schema USAGE, SELECT on four menu tables, SELECT/INSERT only on orders,
  order_items and idempotency_keys. No catalog writes, order status changes,
  administrative data, payment writes, or audit writes.
- PUBLIC loses database CONNECT/TEMP, public-schema access, and application schema
  access. Future tables receive no automatic runtime grants; future functions
  receive no default PUBLIC EXECUTE.

The future API must authorize every request, calculate prices from active catalog
rows on the server, copy snapshots, and write header/items/idempotency together
in one transaction. Never trust client prices or totals. Reusing an idempotency
key with a different request hash must fail. Public clients must not receive raw
order listings or any database connection. Runtime SELECT is a backend permission,
not customer authorization. Staff authentication, status transitions/history,
payment reconciliation, retention/expiry cleanup, and staff privileges require
future implementation and tests. No admin account or default password is seeded.

## Files and execution boundaries

`provision.sql` requires an explicit psql approval flag, postgres on the postgres
database, and a Unix socket. It refuses existing target database/roles. It creates
roles without passwords, creates the database, then restricts database/schema
privileges. CREATE DATABASE cannot be transactional: a failure can leave partial
provisioning. Stop and inspect; never blindly drop existing roles/databases or
rerun by weakening the existence guard. A connection loss between database
creation and privilege revocation also needs manual inspection before use.

`scripts/database.py` requires an explicit socket directory and `--approve-write`,
ignores inherited PG connection variables and psql startup files, and accepts no
TCP host or connection URL. It connects as local postgres to the named database,
then SET ROLE to the owner. It uses an advisory transaction lock, a checksum
ledger, and one transaction for all pending migrations. An applied migration
must never be edited; add a numbered migration. Repeat runs skip matching files;
checksum mismatches fail. There is no automatic destructive down migration.

`seeds/development.sql` preserves the kiosk's 21 exact product names, 3 categories,
2 size labels and 37 variants. Two-price drinks use 12 oz / 16 oz in that order;
soda has only 16 oz. Peso prices are multiplied by 100. The seed upserts names and
variant pairs and can reset development prices; it does not delete extra catalog
rows or reactivate disabled items. It refuses a database containing orders or
admin users. This is development data only, not an approved production menu load.

Only after separately approving live provisioning, the proposed commands from
repository root are:

```sh
sudo -u postgres psql -X --host=/var/run/postgresql --username=postgres --dbname=postgres \
  --set=approve_provision=true --file=apps/api/db/provision.sql
sudo -u postgres python3 apps/api/scripts/database.py migrate \
  --socket-dir /var/run/postgresql --approve-write
# Development database only; requires separate seed approval:
sudo -u postgres python3 apps/api/scripts/database.py seed \
  --socket-dir /var/run/postgresql --approve-write
```

These examples assume the actual cluster socket path and default port have been
verified. No commands above have been run on the live cluster.

## Secrets and local access

No passwords, database URLs, secret files, or privileged account credentials are
included. Later, use an interactive local `psql` session, set session
`password_encryption` to `scram-sha-256`, and use `\password kape_sa_likod_app` to
set a generated password without putting plaintext in SQL, shell history, command
arguments, or Git. Do not enable shell tracing. NULL password disables password
authentication, but peer/trust rules can still authenticate a role; inspect actual
HBA rules before activation.

Keep the API secret file at `/etc/kape-sa-likod/api.env`, outside Git and frontend
builds, readable only by the service identity (0600 or equivalently restricted).
If libpq password files are used later, keep them outside this repository at 0600.
Never commit them. Existing `.env*` ignores are a safeguard, not secret storage.

Prefer a local Unix socket for the future API; loopback TCP would require a
separately reviewed decision. SQL grants cannot enforce network binding. Before
live approval, perform read-only inspection of `listen_addresses`, actual socket
listeners, `pg_hba.conf`, and firewall rules. Stop if 5432 is exposed on public,
LAN, or Tailscale addresses. This work neither verified nor altered the live
network posture. Do not open 5432, add tunnels/forwarding, edit PostgreSQL config,
restart services, or touch PM2, SSH, Tailscale, Cloudflare or unrelated services.

## Safe validation

Run as the ordinary development user (not root or the live postgres identity):

```sh
python3 apps/api/db/tests/validate.py
npm --prefix apps/kiosk run build
npm --prefix apps/kiosk run check
```

The database test uses installed `/usr/lib/postgresql/18/bin` executables, creates
a disposable cluster in a private temporary directory, disables TCP listening,
and uses its own 0700 Unix socket directory and explicit port 55432. Trust is
limited to the private disposable socket; host authentication is rejected. It
never connects to the installed live cluster. Finally it stops only that temporary
cluster and deletes its files. Failure to stop is surfaced instead of ignored.

Checks cover provisioning/write guards, refusal to reuse database/roles,
migration and seed reruns, changed-checksum rejection, exact menu equivalence,
runtime privilege denials and role escalation, positive quantities, nonnegative
prices, complete order creation, deferred total/empty-order rejection, unchanged
historical prices, and seed refusal after orders. They do not prove future API
security, concurrency/retry behavior, backup recovery, or the live network setup.

## Required later approvals

1. Review schema, operational order/payment rules, and production menu/timezone.
2. Approve live read-only access/security review, provisioning and migrations.
3. Decide production menu loading separately; do not use development seeding by default.
4. Approve secret setup, future API/staff implementation and permissions, backups,
   service setup, and any later deployment separately.

No push, merge, deploy, live schema write, or service change is part of preparation.
Privilege/search-path design follows the PostgreSQL 18 documentation:
[schemas](https://www.postgresql.org/docs/18/ddl-schemas.html) and
[privileges](https://www.postgresql.org/docs/18/ddl-priv.html).
