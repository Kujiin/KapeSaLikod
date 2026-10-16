#!/usr/bin/env bash
# Unprivileged preparation only. No database connection or service activation.
set -euo pipefail
repo_dir=$(git -C "$(dirname -- "$0")" rev-parse --show-toplevel)
cd "$repo_dir"
[[ $(git branch --show-current) == feat/postgresql-preparation ]] || { echo 'Unexpected branch' >&2; exit 1; }
git diff --quiet HEAD -- apps/api/src apps/api/package.json apps/api/package-lock.json apps/api/db/migrations apps/api/scripts/create-admin.js apps/api/scripts/backup.py apps/api/scripts/cleanup-images.js || { echo 'Commit/review runtime changes before preparing a release' >&2; exit 1; }
commit=$(git rev-parse HEAD)
stage="$repo_dir/apps/api/.build-production/$commit"
[[ ! -e "$stage" ]] || { echo 'Prepared release already exists; inspect instead of replacing it' >&2; exit 1; }
mkdir -p "$stage"
git archive HEAD apps/api/src apps/api/package.json apps/api/package-lock.json apps/api/db/migrations apps/api/scripts/create-admin.js apps/api/scripts/backup.py apps/api/scripts/cleanup-images.js | tar -x -C "$stage"
npm ci --omit=dev --prefix "$stage/apps/api"
(cd "$stage/apps/api" && node --input-type=module <<'JS'
import {buildApp} from './src/app.js';
import sharp from 'sharp';
const app=await buildApp();
const response=await app.inject({method:'GET',url:'/health'});
if(response.statusCode!==200)throw new Error('Liveness failed');
await sharp({create:{width:1,height:1,channels:3,background:'white'}}).webp().toBuffer();
await app.close();
console.log('Production dependency imports, native WebP and liveness passed; no database connection or listener started.');
JS
)
printf '%s\n' "$commit" > "$stage/RELEASE_COMMIT"
(cd "$stage" && find apps -type f -print0 | sort -z | xargs -0 sha256sum > RELEASE_FILES.sha256)
printf 'Prepared release: %s\n' "$stage"
