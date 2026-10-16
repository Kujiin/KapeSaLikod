#!/usr/bin/env bash
# MANUAL, PRIVILEGED, FILES-ONLY SETUP. No password, daemon-reload, enable or start.
set -euo pipefail
[[ $EUID == 0 && ${1:-} == --approve-files-only && $# == 3 ]] || { echo 'Usage: sudo bash install-prepared.sh --approve-files-only PREPARED_RELEASE EXPECTED_COMMIT' >&2; exit 2; }
source_dir=$(realpath -- "$2")
expected_commit=$3
[[ $expected_commit =~ ^[a-f0-9]{40}$ && -d "$source_dir" && ! -L "$2" ]] || { echo 'Invalid release' >&2; exit 1; }
[[ $(cat "$source_dir/RELEASE_COMMIT") == "$expected_commit" ]] || { echo 'Commit mismatch' >&2; exit 1; }
repo_dir=$(git -c safe.directory="$(cd -- "$(dirname -- "$0")/../../.." && pwd)" -C "$(dirname -- "$0")" rev-parse --show-toplevel)
# Recheck DB first, before any account or persistent filesystem changes.
sudo -u postgres psql -X -w -h /var/run/postgresql -p 5432 -U postgres -d kape_sa_likod < "$repo_dir/apps/api/db/queries/production-preflight.sql"
if ss -H -ltn 'sport = :3100' | read -r _; then echo 'Port 3100 is occupied' >&2; exit 1; fi
for path in /srv/kape-sa-likod /etc/kape-sa-likod /var/lib/kape-sa-likod /var/backups/kape-sa-likod /etc/systemd/system/kape-sa-likod-api.service; do
 [[ ! -e "$path" && ! -L "$path" ]] || { echo "Existing path: $path; inspect manually" >&2; exit 1; }
done
if getent passwd kape-api >/dev/null || getent group kape-api >/dev/null; then echo 'Service identity already exists; inspect manually' >&2; exit 1; fi
if systemctl cat kape-sa-likod-api.service >/dev/null 2>&1; then echo 'Service unit already exists' >&2; exit 1; fi
(cd "$source_dir" && sha256sum --quiet --check RELEASE_FILES.sha256)
# Refuse symlinks that would escape the staged release.
python3 - "$source_dir" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1]).resolve()
for item in root.rglob('*'):
 if item.is_symlink() and not item.resolve().is_relative_to(root):
  raise SystemExit('Release contains an escaping symlink')
PY
systemd-analyze verify "$repo_dir/apps/api/deploy/kape-sa-likod-api.service"
useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin kape-api
install -d -o root -g root -m 0755 /srv/kape-sa-likod /srv/kape-sa-likod/releases
release_dir="/srv/kape-sa-likod/releases/$expected_commit"
cp -a -- "$source_dir" "$release_dir"
chown -R root:root "$release_dir"
chmod -R a+rX,go-w "$release_dir"
install -d -o root -g kape-api -m 0750 /etc/kape-sa-likod /var/lib/kape-sa-likod
install -d -o kape-api -g kape-api -m 0750 /var/lib/kape-sa-likod/uploads
install -d -o postgres -g postgres -m 0700 /var/backups/kape-sa-likod
install -o root -g kape-api -m 0640 "$repo_dir/apps/api/deploy/api.env.example" /etc/kape-sa-likod/api.env
ln -s -- "$release_dir" /srv/kape-sa-likod/current
install -o root -g root -m 0644 "$repo_dir/apps/api/deploy/kape-sa-likod-api.service" /etc/systemd/system/kape-sa-likod-api.service
sudo -u kape-api test -r "$release_dir/apps/api/src/server.js"
sudo -u kape-api test -r /etc/kape-sa-likod/api.env
sudo -u kape-api test ! -w "$release_dir/apps/api/src/server.js"
sudo -u kape-api test ! -w /etc/kape-sa-likod/api.env
sudo -u kape-api test -w /var/lib/kape-sa-likod/uploads
printf '%s\n' 'Files installed. Password absent; service not loaded, enabled or started. Any partial failure needs manual inspection, not a blind rerun.'
