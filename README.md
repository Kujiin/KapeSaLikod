# Kape sa Likod

Option A: one GitHub repository, Cloudflare Pages for static frontends, and the
Ubuntu home server for the future Node.js API and PostgreSQL database.

## Preparation layout

- `apps/kiosk/public/`: byte-identical copy of the existing customer kiosk.
- `apps/kiosk/public-files.json`: reviewed public file allowlist and SHA-256 hashes.
- `apps/kiosk/scripts/`: dependency-free build and preservation checks.
- `apps/api/`: backend plan only; no running application.
- `docs/deployment.md`: deployment boundary and later activation checklist.
- Root HTML/CSS/JS, `assets/`, and `references/`: retained unchanged for compatibility
  with the existing website. Do not remove or edit them during preparation.

The admin dashboard is deferred. Its eventual URL path must be `/swaggar`,
not `/admin`; no admin application or route is created now.

## Local validation

With the existing Node.js installation, no dependency installation is needed:

```sh
npm --prefix apps/kiosk run build
npm --prefix apps/kiosk run check
```

The build publishes only explicitly approved files into `apps/kiosk/dist/`.
It rejects unknown files, directories, symlinks, missing files, and changed hashes.
Approved future frontend edits require deliberate review and manifest updates.
The check compares source and output with the unchanged legacy root kiosk.
This preservation check is intentionally specific to this preparation phase.

Do not serve or deploy the repository root after adding backend material.
Do not push this branch until the deployment checklist has been reviewed:
an existing Pages integration may deploy a pushed branch automatically.
