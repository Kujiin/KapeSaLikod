Implement the café API and `/swaggar/` dashboard, and connect the existing kiosk to
PostgreSQL-backed ordering while preserving the welcome/order-type markup, original
styles and images. Orders start unpaid; prices are calculated by the server and
historical item snapshots survive later menu edits. Saved submission UUIDs protect
retries after an ambiguous response.

Includes three versioned migrations (original 001/002 unchanged), the exact
21-product/37-variant menu seed with empty-catalog protection, scoped runtime
permissions, staff sessions/CSRF/roles, catalog/image management, queue/status
history, manual cash receipts, actual payment reports, settings/accounts/audit,
a fixed-origin Pages API proxy, strict public artifact allowlisting, and unapplied
service/tunnel/backup tooling.

Validation: original SQL suite, real PostgreSQL-backed API tests, DOM functional
tests, transactional backup/restore, public artifact/proxy security tests and
frontend build checks passed. Both dependency audits report zero known issues.
Real Chromium testing is blocked by missing OS libraries and must be completed
before production activation. See `docs/validation-results.md`.

No live database migration, credential setup, service/network change, push or
deployment was performed. Review migration 003 privileges, complete browser QA,
configure the approved API/tunnel/Pages origin, and follow
`docs/backend-implementation.md`. Merging main automatically deploys Pages and
requires explicit approval.
