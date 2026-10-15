import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { kiosk, manifest, digest, verifyTree } from './files.mjs';

await verifyTree(fileURLToPath(new URL('public/', kiosk)));
await verifyTree(fileURLToPath(new URL('dist/', kiosk)));
// During preparation, legacy root files remain an independent preservation check.
for (const [name, hash] of Object.entries(manifest)) {
  assert.equal(digest(await readFile(new URL(`../../${name}`, kiosk))), hash, `Legacy kiosk differs: ${name}`);
}
console.log(`PASS: all ${Object.keys(manifest).length} legacy, source, and output files are byte-identical.`);
