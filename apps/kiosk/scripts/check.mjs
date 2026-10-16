import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { kiosk, manifest, digest, verifyTree } from './files.mjs';

await verifyTree(fileURLToPath(new URL('public/', kiosk)));
await verifyTree(fileURLToPath(new URL('dist/', kiosk)));
// During preparation, legacy root files remain an independent preservation check.
const baseline = JSON.parse(await readFile(new URL('legacy-files.json', kiosk), 'utf8'));
for (const [name, hash] of Object.entries(baseline)) {
  assert.equal(digest(await readFile(new URL(`../../${name}`, kiosk))), hash, `Legacy kiosk differs: ${name}`);
}
console.log(`PASS: all ${Object.keys(manifest).length} approved public files verified; legacy kiosk remains unchanged.`);
