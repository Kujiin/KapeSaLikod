# Validation results — 16 October 2026

## Executed successfully

- Original baseline SQL validation: `python3 apps/api/db/tests/validate.py`.
  PostgreSQL 18 temporary cluster; original 001/002, provisioning guards, reruns,
  checksums, exact 21 products/37 variants, permissions and historical totals.
- `npm --prefix apps/api test`: private socket-only PostgreSQL 18 cluster,
  migrations 001–003, empty-only seed, real restricted-role SQL. Nine API subtests
  (10 TAP tests including the parent) cover exact menu data, health/readiness,
  unauthorized access, origins, CSRF, hashed sessions, concurrent idempotency,
  authoritative prices, invalid bodies, product/category changes, unavailable
  items, snapshots, content-validated uploads and oversize denial, order transitions,
  explicit payments, reporting/audit, settings/accounts, last-owner protection,
  password-change revocation, production Secure/HttpOnly cookie settings, privilege
  denials, logout/revocation, brute-force rate limits and safe outage responses.
- A separate DOM integration test uses the real API/PostgreSQL with jsdom. It
  checks original welcome/order-type markup and CSS preservation, menu/category
  rendering, size selection, quantities, unpaid submission, lost-response retry
  with the same persisted UUID, confirmation/new order, staff login/overview,
  product editing, order listing and logout. Dialog/scroll/media behavior is
  polyfilled; this is functional logic coverage, not visual browser evidence.
- Private custom-format `pg_dump` restored with `pg_restore --single-transaction`
  into a second empty disposable database; ledger/order existence checked.
- `npm --prefix apps/kiosk test`: public build rejects extra secret/SQL/server
  files, hash changes and symlinks; same-origin Pages proxy checks fixed HTTPS
  target, cookie forwarding, private Access header handling, missing config,
  traversal rejection, redirect rejection and safe connection failures.
- `npm --prefix apps/kiosk run build` and `run check`: 24 explicitly approved
  public files; source/dist hashes match, root legacy kiosk files unchanged.
- Dependency audits: API and kiosk each reported zero known vulnerabilities after
  upgrading Sharp to 0.35.5. Package lockfiles are included for reproducibility.
- Shell syntax check for the manual activation script; systemd unit template
  verification passed. systemd also reported pre-existing CPUAccounting warnings
  in unrelated xfs units; those files were not changed.

All database writes above were to disposable private clusters, stopped/deleted at
completion. The live cluster was not modified by tests or this implementation.

## Not passed / not performed

- Real Chromium browser test was attempted, but launch failed because
  `libatk-1.0.so.0` is missing. No system packages were installed. No successful
  visual screenshots or real-browser responsive/accessibility assertions are claimed.
- Browser scenario is prepared at `apps/api/tests/browser.test.js`. After an
  authorized installation of Playwright's Chromium system dependencies, run:
  `python3 apps/api/tests/integration.py --browser`. It includes screenshots,
  original welcome DOM/bounds, categories, cart, lost response + reload/retry,
  confirmation, /swaggar login/products/orders/logout, mobile overflow and offline
  behavior. It has not completed successfully and may reveal issues to fix.
- Cloudflare Workers/Pages remote runtime, actual Pages routing/headers, tunnel,
  real HTTPS cookie flow and preview/production integration are not verified.
  The proxy was tested locally against Web Request/Response APIs.
- Live database access was blocked by sudo authentication. The owner supplied a
  read-only result showing zero tables in `kape`. No live provisioning/migration/
  seed was rerun. New expected ledger count after activation is three, not two.
- Runtime database password, initial real admin account, dedicated service identity,
  environment file, service installation, backups on the live host, tunnel/DNS/
  Access, Pages bindings and production deployment are still pending approval/setup.

This is a tested local implementation with explicit production/browser gates,
not a claim that the live website or database is activated.
