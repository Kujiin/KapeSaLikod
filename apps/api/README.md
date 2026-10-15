# Future Ubuntu API

Preparation only: no executable server, dependencies, migrations, credentials,
database, or service is created in this phase.

Proposed implementation: Node.js with TypeScript, Fastify, PostgreSQL `pg`,
request validation, and versioned SQL migrations. Future directories: `src/routes`,
`src/services`, `src/repositories`, `src/config`, `migrations`, `seeds`, and `tests`.
Dependency choices and versions will be reviewed before installation.

The API will bind to an unused loopback port, under a dedicated unprivileged
systemd service. Do not use or alter existing PM2 processes. A separately approved
Cloudflare Tunnel may eventually expose only this API, never PostgreSQL.

Use a dedicated PostgreSQL database and distinct migration/runtime roles. Bind
PostgreSQL only to loopback with narrow authentication rules; never expose 5432
publicly, over LAN, through Tailscale, or through a tunnel.

Planned tables: categories, products, product_variants, orders, order_items,
order_status_events, payments, admin_users, admin_sessions, audit_events, and
idempotency_keys. Use integer centavos, positive quantities, historical item/price
snapshots, transactions for order creation, server-calculated totals, and
timezone-aware timestamps. Confirm actual menu and business timezone before seeds.

Public endpoints: menu reads and rate-limited, idempotent order creation. Staff
endpoints require server-side authentication and roles; CORS is not authentication.
The future dashboard path is `/swaggar`. No dashboard is implemented here.

Production environment file: `/etc/kape-sa-likod/api.env` with restricted ownership
and permissions. Releases: `/srv/kape-sa-likod/releases/<commit>`. Keep credentials,
uploads, logs, PostgreSQL data, and backups outside the repository and all frontend
build inputs. No database credentials or permanent device secrets in browser code.
