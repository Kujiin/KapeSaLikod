# Ubuntu backend preparation — 16 October 2026

No privileged installation, password creation, service start, PostgreSQL change,
tunnel change, Git push, or frontend deployment has been performed.

## Verified locally

- Branch: `feat/postgresql-preparation`. Runtime release commit:
  `0ceb350a7996f9f3e4c3f14a4b8fafcd1b987b3e`.
- Port 3100: no TCP listener; a temporary bind to 127.0.0.1:3100 succeeded and was
  closed without listening. Recheck at installation/start; this is not a reservation.
- PostgreSQL TCP listener: 127.0.0.1:5432 only in the current socket listing.
- No kape-api OS user/group, Kape deployment paths or Kape/cloudflared service units
  found. No cloudflared process or executable found on PATH. Standard tunnel
  directories were not visible/present; inaccessible locations/account-managed
  tunnels cannot be ruled out. No tokens or process command arguments inspected.
- A fresh ignored release under `apps/api/.build-production/<commit>` was prepared
  from committed API source with `npm ci --omit=dev`, a file checksum manifest,
  successful dependency imports, native Sharp WebP encoding and /health injection.
  No listener or database connection was started by this release smoke check.
- The systemd template passes `systemd-analyze verify` (unrelated existing xfs
  CPUAccounting deprecation warnings). No unit was installed or reloaded.
- The read-only preflight was tested in a disposable cluster, including rejection
  of a catalog count mismatch. The privileged installer is syntax/review checked,
  not executed; actual service permissions still require verification on installation.
- Backup/restore and hidden initial-owner bootstrap were exercised against the
  disposable cluster by the existing integration suite; no live backup/admin created.

## 1. Next action: read-only live verification

Sudo authentication is unavailable in the agent session. The owner reports running
database activation, but its success/counts and active auth rules remain unverified
here. Run from your authenticated SSH terminal and share the non-secret output:

```sh
cd /home/kujin/projects/kape-sa-likod
sudo -u postgres psql -X -w -h /var/run/postgresql -p 5432 -U postgres \
  -d kape_sa_likod < apps/api/db/queries/production-preflight.sql
```

Required: **3 categories, 2 sizes, 21 products, 37 variants, 3 migrations**, and
matching checksums. Any error/count mismatch stops activation; do not rerun seeds
or provisioning. The query prints HBA rule types and password-set/SCRAM booleans,
never passwords, verifiers, or session tokens.

For 127.0.0.1 the first matching host/hostssl/hostnossl HBA rule must support SCRAM
for `kape_sa_likod` / `kape_sa_likod_app`. Check database/user/address/SSL conditions
and reject/error rules in order. `pg_hba_file_rules` describes files, so final
proof is an actual restricted-role connection after separately approved secret
setup. A NULL password cannot authenticate with SCRAM. If the matching rule is
peer/trust/reject or unsuitable, stop for review; do not edit/reload PostgreSQL.

## 2. After clean preflight: approve files-only installation

Review `apps/api/deploy/install-prepared.sh`, then explicitly approve/run:

```sh
sudo bash apps/api/deploy/install-prepared.sh --approve-files-only \
  "$PWD/apps/api/.build-production/0ceb350a7996f9f3e4c3f14a4b8fafcd1b987b3e" \
  0ceb350a7996f9f3e4c3f14a4b8fafcd1b987b3e
```

It rechecks DB counts/checksums, port and existing paths/identity; refuses to replace
an existing setup; verifies the prepared release; then creates only:

| Item | Ownership / permissions |
| --- | --- |
| kape-api | System account/group, nologin, no created home |
| /srv/kape-sa-likod/releases/COMMIT | Root-owned, readable/executable as needed, not service-writable |
| /srv/kape-sa-likod/current | Root-owned link to that release |
| /etc/kape-sa-likod | root:kape-api, 0750 |
| /etc/kape-sa-likod/api.env | root:kape-api, 0640; example config, **no password** |
| /var/lib/kape-sa-likod | root:kape-api, 0750 |
| /var/lib/kape-sa-likod/uploads | kape-api:kape-api, 0750; persists across releases |
| /var/backups/kape-sa-likod | postgres:postgres, 0700 |
| /etc/systemd/system/kape-sa-likod-api.service | root:root, 0644 |

The installer checks the service identity can read code/config, cannot write them,
and can write uploads. It does **not** call daemon-reload, enable/start/restart a
service, install packages, create a password, mutate DB data or change HBA/networking.
System setup is not transactional: if it fails partway, stop for inspection rather
than deleting/recreating identities or blindly rerunning it.

## 3. Separate approval: secrets, bootstrap and service activation

Do not run this phase yet. After auth review, privately set the application role's
password with interactive psql `\password`, then edit the real environment file
without printing it. Details are in [the existing guide](backend-implementation.md#secure-initial-access).
The files-only installer uses root:kape-api 0640 (equivalently private to the API
identity and root), superseding the older suggestion of service-owned 0600.
No password is needed to create a local administrative backup:

```sh
sudo -u postgres python3 /srv/kape-sa-likod/current/apps/api/scripts/backup.py \
  "/var/backups/kape-sa-likod/before-first-admin-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

After the password/config is explicitly approved and entered, validate restricted
role access without starting a listener (all errors suppressed to avoid secret output):

```sh
sudo -u kape-api /usr/bin/node --env-file=/etc/kape-sa-likod/api.env --input-type=module <<'JS'
const {buildApp}=await import('/srv/kape-sa-likod/current/apps/api/src/app.js');
const app=await buildApp();
try {
 const response=await app.inject({method:'GET',url:'/ready'});
 if(response.statusCode!==200)throw Error();
 console.log('Restricted database connection and migration readiness passed.');
} catch {console.error('Readiness failed; inspect authentication/configuration privately.');process.exitCode=1;}
finally {await app.close();}
JS
```

Create the first dashboard owner interactively, only after approval:

```sh
sudo -u kape-api /usr/bin/node --env-file=/etc/kape-sa-likod/api.env \
  /srv/kape-sa-likod/current/apps/api/scripts/create-admin.js
```

It hides/confirm-checks the password, hashes it, refuses duplicate bootstrap, and
records an audit event. Do not paste passwords here. `/swaggar/` will not become
publicly available until the separately approved frontend release.

After explicit approval for service activation:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now kape-sa-likod-api.service
curl --fail http://127.0.0.1:3100/health
curl --fail http://127.0.0.1:3100/ready
sudo systemctl status kape-sa-likod-api.service --no-pager
```

Only this new service is affected. The API binds 127.0.0.1. Do not touch PM2 or expose
5432. Logs: `sudo journalctl -u kape-sa-likod-api -n 50 --no-pager` (never dump env).

## Cloudflare prerequisites — no changes made

Account inventory is not accessible here. In Cloudflare, confirm:

1. Your account and an active domain/DNS zone you control; the Pages hostname
   `kapesalikod.pages.dev` is not an owned zone for publishing a named API tunnel.
2. Existing tunnel inventory in the Zero Trust / Networks / Tunnels area. Do not
   edit an unrelated tunnel. Select a new dedicated tunnel/connector after approval.
3. An unused approved HTTPS hostname, e.g. `api.<your-domain>`; publish only
   `http://127.0.0.1:3100` through it, final 404 ingress, never PostgreSQL.
4. Authorized tunnel connector installation/credentials and DNS route. Installation,
   token entry, account login and service startup need separate approval.
5. Later Pages server-side `API_ORIGIN=https://<approved-hostname>` binding. Optional
   Access service-token policy uses encrypted ACCESS_CLIENT_ID/SECRET bindings.
   Keep application authorization/CSRF; don't put interactive Access redirects on
   the public menu. Review API caching/rate limits and test HTTPS cookies first.

Domain and published application requirements:
[Cloudflare Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/).
No hostname is selected and no frontend deployment is authorized in this phase.
