# Kape sa Likod API

Node.js 22 ESM + Fastify + PostgreSQL 18. This is implemented source, **not a live
service**. The existing database has been provisioned manually; do not run
`db/provision.sql` again. Live schema state last reported: no tables in `kape`.

Start with [the implementation and activation guide](../../docs/backend-implementation.md).

## Development and tests

```sh
npm ci --prefix apps/api
npm ci --prefix apps/kiosk
npm --prefix apps/kiosk run build
npm --prefix apps/kiosk run check
npm --prefix apps/api test
# Optional real Chromium checks, after its system libraries are available:
python3 apps/api/tests/integration.py --browser
```

Tests require local PostgreSQL 18 binaries at `/usr/lib/postgresql/18/bin` and run
as your ordinary OS user, without sudo. They create private temporary socket-only
clusters and never connect to the live cluster. API tests exercise real PostgreSQL
and the restricted application role, not a database mock. A single test deliberately
uses a failing adapter to verify sanitized outage responses. DOM tests use jsdom
with dialog/scroll polyfills; they do not establish visual browser compatibility.

## Source organization

- `src/config.js`: local database/loopback API configuration.
- `src/db.js`: pool, transaction helper and parameterized audit inserts.
- `src/security.js`: scrypt passwords, SHA-256 session hashing, authorization.
- `src/validation.js`: strict Zod input schemas.
- `src/routes/`: auth, catalog, orders, administration and images.
- `src/app.js`: application factory, origin checks, CSRF integration, limits,
  safe errors, health/readiness. `src/server.js`: loopback listener/shutdown.
- `db/`: immutable numbered SQL, development/initial-menu seed, example queries.
- `scripts/`: guarded migrations, initial owner bootstrap, private backups, image GC.
- `deploy/`: unapplied systemd, environment and dedicated tunnel examples.

No secrets go into this directory. Configure the actual runtime outside Git at
`/etc/kape-sa-likod/api.env`. `deploy/api.env.example` contains names, no password.

## Routes

The backend uses `/v1`; Pages proxies `/api/v1` to it. `/health` is liveness;
`/ready` checks the expected migration checksum. Only the menu, order creation,
login and generated image reads are public. There is no public order-list endpoint.

| Method/path | Authorization / purpose |
| --- | --- |
| GET `/v1/menu` | Menu, sizes, variants, availability and public café details |
| POST `/v1/orders` | Strict type/items body and UUID `Idempotency-Key` |
| GET `/v1/images/:name` | Re-encoded public product image |
| POST `/v1/auth/login` | Origin, IP rate limit and persistent account throttling |
| GET `/v1/admin/session` | Staff session and CSRF token |
| POST `/v1/admin/logout`, `/password` | Session + CSRF; password change revokes sessions |
| GET `/v1/admin/overview`, `/orders`, `/orders/:id` | Staff |
| POST `/v1/admin/orders/:id/status`, `/cash-payment` | Staff, CSRF, locked transaction |
| GET `/v1/admin/catalog`, `/settings` | Staff |
| POST/PUT `/v1/admin/products[/:id]` | Owner/manager, CSRF |
| POST `/v1/admin/products/:id/archive`, `/image` | Owner/manager, CSRF |
| POST/PUT `/v1/admin/categories[/:id]` | Owner/manager, CSRF |
| PUT `/v1/admin/settings` | Owner/manager, CSRF |
| GET `/v1/admin/audit` | Owner/manager; paginated |
| GET/POST `/v1/admin/accounts`, PUT `/accounts/:id` | Owner only; no password hashes returned |

The one runtime DB role has specifically enumerated table/column permissions for
both public and administrative requests. The API is the staff authorization
boundary; these are not separate database identities per staff member. It still
cannot perform DDL, become owner, delete history, update item snapshots or read
ungranted future tables. See `003_backend_features.sql` before approving its grants.

CORS uses exact origins; it is not authorization. All unsafe requests require an
allowed Origin; admin writes additionally require CSRF + a valid active session.
Production cookies are `__Host-ksl_session`, Secure, HttpOnly, SameSite=Strict,
Path=/, no Domain. Sessions expire absolutely after eight hours; raw tokens are
never stored in PostgreSQL. Frontend credentials remain on the same Pages origin
through the fixed upstream proxy; no third-party-cookie dependency is introduced.

## Operational rules

Money is integer centavos. Statuses: pending → accepted/preparing → ready →
completed; cancellation is possible before completion for unpaid orders. Completion
requires an explicitly recorded cash payment. Paid cancellation/refund is blocked
until a reviewed refund feature exists. An order begins unpaid; clicking submit
never charges or confirms payment. Zero-price variants are supported, but completing
zero-total orders requires a future reviewed workflow. No card integration exists.

A transaction locks catalog rows, calculates prices, copies historical snapshots,
creates header/items/history/idempotency, and enforces matching totals at commit.
Concurrent retries of the same UUID serialize; a changed payload returns 409.
Expired idempotency records are intentionally retained: cleanup must not undermine
retry guarantees. Reporting uses actual `paid` payment rows only, by the configured
café timezone (initially Asia/Manila; confirm before activation).

Product management archives instead of deleting. Size variants can be enabled,
disabled and repriced using the two prepared sizes. Arbitrary new size definitions,
refunds, inventory, tax/discount rules, exports and password-reset email are not
implemented. Owners can create/deactivate accounts; users change their own password.

Images: one file, 5 MiB maximum, decoded PNG/JPEG/WebP only, 16 million pixel limit,
static images only, metadata removed by WebP re-encoding, random UUID names,
1200×1200 maximum, persistent `/var/lib/kape-sa-likod/uploads`. Filename/type claims
are ignored. Replacement never removes a currently referenced image. Run
`node scripts/cleanup-images.js` for a dry run; `--apply` deletes only unreferenced
regular UUID WebP files older than seven days. Back up uploads with the database.

Rate limits are intentionally conservative for a single café. Forwarded IP headers
are not trusted. Behind the tunnel the loopback proxy can share an IP budget;
production needs Cloudflare edge limits as well. Review based on observed traffic,
without trusting arbitrary browser-supplied forwarding headers. Account failure
tracking persists across restarts. Revoked/expired sessions and login-attempt rows
are retained until an approved retention job is added; keep account/table growth
under review. Do not expose logs or DB errors to customers.

Implementation references: [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/),
[multipart limits](https://github.com/fastify/fastify-multipart), and
[PostgreSQL password prompting](https://www.postgresql.org/docs/18/app-psql.html).
