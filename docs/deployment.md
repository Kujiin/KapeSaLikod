# Deployment preparation — no activation authorized

No Cloudflare setting, DNS record, tunnel, service, database, dependency, or live
website is changed by this preparation. No commit or push is performed.

## Pages artifact boundary

Proposed settings, to review and apply only in a later approved phase:

| Setting | Value |
| --- | --- |
| Repository | Existing KapeSaLikod repository |
| Production branch | main |
| Framework | None |
| Root directory | apps/kiosk |
| Build command | npm run build |
| Build output directory | dist |

Never use repository root, `apps`, or `apps/kiosk` as the output directory.
Only `apps/kiosk/dist` is a publishable artifact. Build tooling, manifests,
references, and API files must not be published. Root selection is not a secrets
boundary: Pages may check out the repository. Secrets must never enter Git or
frontend build environments. Only public API configuration belongs in a browser.

The build validates both input and output against exact file paths and hashes.
Do not replace the explicit copy with recursive repository copying, glob-based
publication, a repository-root fallback, or symlinks. `.gitignore` is an additional
Git safeguard, not an access-control or deployment boundary. Review newly approved
files for secrets; a hash cannot determine whether content is safe.

Root kiosk files are deliberately retained unchanged because current remote Pages
settings have not been verified. This duplicates frontend files temporarily.
After the isolated artifact is reviewed, switch Pages settings in a separately
approved deployment. Remove legacy root files only after successful cutover.

The existing live website is unaffected by local edits. A push could trigger
production or preview deployment, especially if current Pages output is repository
root; therefore **do not push any preparation changes before reviewing deployment
settings and agreeing on a controlled cutover**. No automatic deployment workflow
or Pages configuration file is added in this phase.

## Future admin frontend

Reserve URL path `/swaggar` on the chosen frontend hostname. A separate Pages
project does not by itself mount another app on this path. Decide a combined
static artifact or an explicitly configured routing arrangement before building
the dashboard. No `/admin` route, placeholder UI, or SPA fallback is added now.
API authentication and authorization are required even if dashboard assets are public.

## Next approval gates

1. Review local diff, build artifact, and byte-preservation results. Browser smoke
   check welcome animation, both order types, navigation, all categories, prices,
   product images, reduced motion, resizing, and the ordering-unavailable toast.
2. Inspect existing Pages production/preview settings without changing them;
   agree on safe branch handling before any push. No preview writes to production.
3. Approve Pages cutover and exact artifact separately. Verify live assets and
   rollback procedure before removing legacy frontend files.
4. Approve backend implementation and dependency installation separately. Test
   order transactions and retry handling against a disposable database.
5. Before provisioning, verify actual host sockets, database ownership, cluster
   state, authentication rules, capacity, and an unused loopback API port.
6. Review dedicated service, secret-file permissions, backups/restore, DNS, and
   tunnel configuration before activation. Preserve PM2, bots, SSH, Tailscale,
   and unrelated server configuration.

Future API releases should use a reviewed commit, isolated release directories,
backup before migrations, backward-compatible schema changes, readiness checks,
and application rollback. Only the dedicated API service may be restarted.
PostgreSQL must remain private. No CI deployment or self-hosted runner is created.
