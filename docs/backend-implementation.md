# Backend, kiosk and /swaggar implementation handoff

## Current school-demo setup

See [the live setup update](validation-results.md#current-live-setup-update).
The owner has since activated the database, installed/configured the dedicated API
service and created the first owner account. The selected no-domain demo connection
is Tailscale Funnel at `https://houseofkujin.tail2a7c37.ts.net:8443`, in background
mode, to 127.0.0.1:3100. Use that origin for the Pages Production API_ORIGIN setting.
The existing private Tailscale service on 443 remains untouched. PostgreSQL remains
local. Frontend publication is still pending; do not treat local code as deployed.
The original Cloudflare named-tunnel instructions below are an alternative, not
an additional requirement for this school demo.

## Historical status and boundaries

Work is local on `feat/postgresql-preparation`. The database was already provisioned
manually by the owner. The last live inspection supplied by the owner showed no
`kape` tables. This development session cannot authenticate sudo. No live migration,
seed, password setup, service installation/restart, networking change, deployment,
push or merge has been performed. No existing PM2, SSH, Tailscale or Cloudflare
service has been changed. Old preparation-only docs are historical; this guide
supersedes their unchanged-kiosk and no-backend statements.

## What is implemented

The customer kiosk retains its original welcome/order-type markup, imagery,
animations and responsive styling. Menu data comes from the API instead of a
hardcoded catalog. New dialogs add size selection, cart quantities/removal,
estimated totals, explicit unpaid submission, server reference/total confirmation,
and a new-order action. Loading, retry and offline failures are visible. A pending
submission payload/UUID is stored in sessionStorage; an ambiguous response keeps
the same payload locked for retry, including after reload. Do not clear browser
storage or close the kiosk tab while an order is unresolved. Clearing it can lose
the retry key; staff should check orders before submitting again.

`/swaggar/` has its own HTML/CSS/JS modules: secure staff login/logout, overview,
real collected-cash reporting, product/category management, archive/availability,
descriptions, size/price editing, secure image uploads/previews, searchable order
queue, detail/history, valid status changes, explicit cash receipt, café settings,
password changes, owner-controlled staff accounts and paginated audit history.
The public kiosk contains no dashboard link. Staff cannot mutate menu/settings or
manage accounts; managers cannot manage accounts. The route is discoverable static
HTML, but data and actions require server-side authorization. It is not a secret URL.

The API uses Fastify, `pg`, Zod, Node scrypt, hashed opaque sessions, CSRF, exact
origins, rate limits, transactions and Sharp. [API details](../apps/api/README.md).
No real payment gateway, automated payment confirmation, refunds, inventory or
email password-reset service is implemented.

## Database and migrations

The existing database and NOLOGIN owner must be retained. **Never rerun provision.sql.**

- 001: categories, sizes, products, product variants and timestamp triggers.
- 002: orders, historical items, deferred sum validation, status events, payments,
  admin identities/sessions, audit and idempotency.
- 003: product descriptions, public order references, explicit payment state,
  CSRF data, café settings, persistent login throttling and scoped runtime grants.
- Migration ledger: filename, SHA-256 and applied timestamp; edited applied files
  fail. All pending migrations are applied in one locked transaction.

The first two migrations and original seed are unchanged. The initial seed matches
21 products/37 variants/3 categories/2 sizes. New seed protection refuses any
existing catalog data. If tables or a ledger are partially present, inspect before
writing. Do not repair failed state by dropping tables or editing old migrations.

Once the new migration is reviewed, the exact manual command from the checkout is:

```sh
bash apps/api/scripts/activate-database.sh --approve-migrations-and-initial-menu
```

This authenticates sudo normally, checks the existing dedicated database/roles,
stages only non-secret SQL/tooling privately, applies missing migrations, seeds
only an entirely empty catalog, and prints counts/checksums. It never provisions,
changes PostgreSQL settings, or sets passwords. Expected initial counts now include
**3 migrations**: 3 categories, 2 sizes, 21 products, 37 variants, 3 migrations.
If the catalog already exists it skips seed, then requires exact initial counts;
a mismatch is an inspection stop, not an instruction to overwrite legitimate data.
Back up first if this command is used after any real data has been entered.

## Secure initial access

Provisioning left `kape_sa_likod_app` with NULL password. Data loading through local
postgres administration requires no app password. Before running a real API:

1. Review existing `pg_hba_file_rules` read-only. The simplest runtime choice is
   loopback `127.0.0.1` using an already configured SCRAM rule. If a suitable rule
   is absent, stop for separate authentication-config approval. Do not enable trust.
2. In an interactive local `sudo -u postgres psql -X -h /var/run/postgresql -d postgres`
   session, run `SET password_encryption='scram-sha-256';` then
   `\password kape_sa_likod_app`. Enter a generated password at the hidden prompts.
   No password in SQL literals, shell arguments, Git, chat or terminal output.
   The session setting does not change global PostgreSQL configuration.
3. Put it privately in `/etc/kape-sa-likod/api.env` (0600, owned by the dedicated
   service account). Use the reviewed `deploy/api.env.example` for variable names.
   Never print/cat the actual file. Do not use `set -x`, paste secrets into chat,
   or place credentials in a connection URL. Backups include password hashes and
   sessions, so protect them as secrets too.
4. After migrations and service identity/config exist, create the first owner:

```sh
sudo -u kape-api /usr/bin/node --env-file=/etc/kape-sa-likod/api.env \
  /srv/kape-sa-likod/current/apps/api/scripts/create-admin.js
```

It prompts for email/name and a hidden password twice, hashes it, creates one owner,
and audits the action. It refuses when an active owner exists. No credential is
printed or seeded. Additional accounts are created in the authenticated dashboard.

## Frontend and Cloudflare Pages

Keep project `kapesalikod`, production branch `main`, root `apps/kiosk`, build
`npm run build`, output `dist`. The build uses an explicit path/hash manifest,
rejects unknown files/symlinks and publishes only approved kiosk/dashboard assets.
The legacy root files remain unchanged and have a separate preservation manifest.
The only private server code in Pages is the small `functions/api/[[path]].js`
proxy; it is outside static dist. API/database source, SQL, logs, dumps and secrets
are never copied into dist. Pages builds that source into a server Function.

Set a **server-side Pages variable** `API_ORIGIN=https://<approved-api-hostname>`
after a real API hostname is chosen. This is not a browser credential. Optional
`ACCESS_CLIENT_ID` and `ACCESS_CLIENT_SECRET` are encrypted Pages secrets for a
Cloudflare Access service-token policy. Never place these in frontend JS. The
proxy accepts only a fixed HTTPS origin, preserves the staff cookie/CSRF header,
rejects upstream redirects, and forwards `/api/v1/...` to `/v1/...`.
`_routes.json` invokes the Function only for `/api/*`; static assets stay static.
No custom domain ownership was established. No Cloudflare settings were inspected
or changed. Do not deploy the frontend before API routing works: without it the
menu displays a clear unavailable state rather than hardcoded data or fake orders.

After approved deployment:

- Kiosk: https://kapesalikod.pages.dev/
- Staff: https://kapesalikod.pages.dev/swaggar/

Do not add a SPA fallback or an `/admin` alias. The physical dashboard index serves
`/swaggar/`. Preview deployments should use a separate API/database. A preview
origin is denied by the production API unless deliberately allowed; do not allow
wildcard preview origins against production customer data.

## Cloudflare Tunnel — approval required

Read-only inspection found no `cloudflared` executable or matching systemd unit
in this execution environment. This does not prove no tunnels exist elsewhere.
Inspect the Cloudflare account/dashboard and host before installing anything.
Confirm ownership of a domain with an API hostname; `pages.dev` alone does not give
an independently managed hostname for a named tunnel. Avoid temporary quick-tunnel
URLs for production.

After explicit account/domain/network approval, install Cloudflare's supported
Ubuntu package, log in interactively with `cloudflared tunnel login`, create a NEW
named tunnel (`cloudflared tunnel create kape-sa-likod-api`), then use a dedicated
configuration based on `apps/api/deploy/cloudflared.yml.example`. Map only the
approved hostname to `http://127.0.0.1:3100`, with a final 404 ingress rule. Create
the DNS route with `cloudflared tunnel route dns kape-sa-likod-api <approved-hostname>`.
Use a separately named systemd connector/config; do not run a generic install
command that could replace an existing cloudflared service. Protect its credential
JSON outside Git. Validate ingress with the dedicated config before starting it.
**Never tunnel or forward 5432.** No router or Tailscale change is needed.

Cloudflare Access can additionally protect the API hostname, using a service-token
policy for the Pages proxy. Keep application login/roles/CSRF regardless. If you
also put staff pages behind Access, allow the public kiosk and its public API
operations; test cookie/proxy login end to end. Do not add an interactive Access
redirect to the public menu endpoint. Review Cloudflare edge rate limits because
the API intentionally does not trust incoming forwarded-IP headers.

## Ubuntu service — approval required

Templates are prepared but unapplied. Reserve an unused loopback port (example
3100) and a dedicated unprivileged `kape-api` system account with no interactive
login. Create these locations with restricted ownership after approval:

- `/srv/kape-sa-likod/releases/<commit>/`: root-owned reviewed code and production
  dependencies, readable by kape-api; service account cannot modify code.
- `/srv/kape-sa-likod/current`: symlink to the selected release.
- `/etc/kape-sa-likod/api.env`: actual service configuration, private to the identity.
- `/var/lib/kape-sa-likod/uploads`: persistent kape-api-owned storage, 0750.
- `/var/backups/kape-sa-likod`: postgres-owned 0700 private backup storage.

Install dependencies with `npm ci --omit=dev --prefix apps/api` in the staged
release before activation. Do not build or run as the database superuser. Review
and install `deploy/kape-sa-likod-api.service` into `/etc/systemd/system/` only after
approval. `systemctl daemon-reload` and enabling/starting that unit require approval.
No PM2 entry is needed or changed. Commands after installation:

```sh
sudo systemctl start kape-sa-likod-api
sudo systemctl stop kape-sa-likod-api
sudo systemctl restart kape-sa-likod-api
sudo systemctl status kape-sa-likod-api --no-pager
sudo journalctl -u kape-sa-likod-api -n 100 --no-pager
curl --fail http://127.0.0.1:3100/health
curl --fail http://127.0.0.1:3100/ready
```

Update safely: back up DB/uploads, stage a new immutable release, `npm ci`, test,
apply reviewed additive migrations through the guarded runner, switch `current`,
restart only the new dedicated API service after approval, verify readiness and
real browser flows, then deploy the compatible frontend. Never run `pm2 restart all`.

## Backups and restore

The backup script uses pg_dump custom format, preserves ACLs, omits object owners,
refuses overwrite, creates a 0600 dump outside the checkout and removes partial
output on error. Run as local postgres with a private writable destination:

```sh
# Run the script from an accessible reviewed release, not inside /home/kujin:
sudo -u postgres python3 /srv/kape-sa-likod/current/apps/api/scripts/backup.py \
  /var/backups/kape-sa-likod/pre-update-YYYYMMDD-HHMM.dump
```

Also back up persistent uploads and private configuration separately with restricted
access. Copy encrypted backups off the server, define retention, and practice a
restore. Stop writes for a consistent DB+image maintenance snapshot; a DB-only
pg_dump is transactionally consistent while the API runs. No backup schedule was
installed. Do not put backups or tunnel credentials in Git or Pages.

Restore first into an approved scratch database/isolated cluster. Provision the
required restricted roles there, create an empty database owned by
`kape_sa_likod_owner`, then use:

```sh
pg_restore --exit-on-error --single-transaction --no-owner \
  --role=kape_sa_likod_owner --host=<local-socket-directory> \
  --username=postgres --dbname=<approved-empty-restore-database> <private-backup.dump>
```

Database-level ownership/CONNECT/TEMP restrictions are not recreated by a dump
without CREATE DATABASE; reapply the reviewed database boundary on a new target.
Check menu/order/payment counts, migration checksums and permissions, restore the
matching upload snapshot, and only then plan a live recovery. Never use `--clean`
on production or overwrite live data as an automatic rollback.

## Remote SQL in VS Code

Continue using Tailscale + Remote SSH into `houseofkujin`. Open the project and edit
`apps/api/db/migrations/*.sql`, `seeds/*.sql`, `queries/inspect.sql` and scripts in
that remote workspace. `.sql` files are source instructions; actual data lives in
the PostgreSQL server's data directory and is not edited through these files.
Never edit PostgreSQL data files manually.

In the remote integrated terminal:

```sh
sudo -u postgres psql -X -h /var/run/postgresql -d kape_sa_likod
# In psql:
# BEGIN READ ONLY;
# \dt kape.*
# SELECT reference,status,total_centavos FROM kape.orders LIMIT 20;
# COMMIT;
```

For the example query file, use shell input redirection so postgres need not read
your home directory: `sudo -u postgres psql -X -h /var/run/postgresql -d kape_sa_likod
< apps/api/db/queries/inspect.sql` (one shell line).

A VS Code PostgreSQL extension must run in the **Remote SSH host**, connecting to
127.0.0.1:5432 there. Prefer a separately approved read-only login role; the runtime
role has writes and should not be a general SQL browsing credential. Configure
that account only with separate approval, use the extension's secure credential
storage, and keep connection files out of Git. Do not store postgres superuser
credentials in VS Code. If no extension authentication is configured, use local
sudo psql instead. Never expose a database port or modify Tailscale routing for this.

## Git, review and deployment order

Local logical commits are authorized; no push/merge/deployment is authorized.
After reviewing the local commits, if SSH credentials are available in your own
terminal, the exact push/PR commands are:

```sh
git switch feat/postgresql-preparation
git push -u origin feat/postgresql-preparation
gh pr create --base main --head feat/postgresql-preparation \
  --title "Implement café API, kiosk ordering and /swaggar administration" \
  --body-file docs/pull-request.md
```

Pushing may trigger a Pages preview. Agree on preview/API separation first. Review
the PR, complete browser checks, deploy/verify the API and Pages Function config,
then merge only with explicit approval. Because main auto-deploys Pages, **merging
is a production deployment action**. When authorized: `gh pr merge <number> --merge`.
No PR was created remotely because pushing is not authorized.

## Validation, acceptance and rollback

See [validation results](validation-results.md) for executed tests and limits.
Before production approval, verify all 21 products/37 variants, all categories,
images, both order types, size/cart changes, estimated vs authoritative totals,
offline behavior, lost-response retry, login/logout, staff role denials, uploads,
status/payment history, and mobile layouts in a real browser. Verify PostgreSQL
still listens only locally. Record a low-value real test order clearly; never
invent sales or run destructive automated tests on live data.

Troubleshooting: no menu → check Pages API_ORIGIN, Function response, tunnel ingress,
local /ready, migrations and PG credentials. 401 → expired/revoked session; sign
in again. 403 → exact Origin, CSRF or account role. 409 on order → refresh menu;
on status → inspect transition/payment state. 413 → image over 5 MiB. 503 → DB/API
unavailable or schema mismatch. Read only dedicated API logs; never dump secrets
or echo the environment file.

Rollback application code by pointing `current` to the previous compatible release
and restarting only the API service after approval. Roll back Pages to its previous
successful deployment if needed. Keep additive database migration 003; old API
compatibility must be reviewed before rollback. Do not auto-drop schema columns or
restore a database over newer customer orders. For damaged data, stop writes and
use the separate verified-backup recovery procedure with approval.
