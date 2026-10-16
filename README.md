# Kape sa Likod

Option A monorepo: Cloudflare Pages serves the customer kiosk and `/swaggar/`,
with a dedicated Ubuntu Node.js API and locally accessible PostgreSQL 18 database.

- `apps/kiosk/public/`: original kiosk appearance plus API-backed menu/cart/order flow,
  and a separate staff dashboard in `swaggar/`.
- `apps/kiosk/functions/`: fixed-upstream same-origin API proxy for Cloudflare Pages.
- `apps/kiosk/scripts/`: explicit public artifact allowlist/hash validation.
- `apps/api/`: Fastify API, SQL migrations, initial menu seed, tests and unapplied
  service/deployment templates.
- Root legacy HTML/CSS/JS and images: preserved unchanged as a reference baseline.

[Implementation, activation and operations guide](docs/backend-implementation.md) ·
[API details](apps/api/README.md) · [Validation results](docs/validation-results.md)

```sh
npm ci --prefix apps/api
npm ci --prefix apps/kiosk
npm --prefix apps/kiosk run build
npm --prefix apps/kiosk run check
npm --prefix apps/api test
```

Publish only `apps/kiosk/dist`, with Cloudflare Pages root `apps/kiosk`, build
`npm run build`, output `dist`. Never serve the repository root. SQL, backend source,
credentials, backups and private configuration must not enter static output.

Development source is not production activation. Do not rerun database provisioning:
the dedicated live database already exists. Review migration 003 permissions and
follow the guarded activation guide. Sudo-authenticated live database access,
credentials, the API service, Cloudflare Tunnel, Pages bindings and deployment
require manual setup/approval. No PM2, SSH, Tailscale or unrelated service changes.
Do not push or merge until reviewed; Pages can auto-deploy pushed branches/main.
