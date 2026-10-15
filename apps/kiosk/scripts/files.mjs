import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const kiosk = new URL('../', import.meta.url);
export const manifest = JSON.parse(await readFile(new URL('public-files.json', kiosk), 'utf8'));
export const digest = data => createHash('sha256').update(data).digest('hex');

// No directory discovery is used to decide what to publish.
for (const [name, hash] of Object.entries(manifest)) {
  if (!/^(index\.html|script\.js|style\.css|assets\/[a-z0-9-]+\.png)$/.test(name)
      || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid public manifest entry: ${name}`);
}
if (!['index.html', 'script.js', 'style.css'].every(name => name in manifest)) {
  throw new Error('Missing kiosk entry files');
}

export async function verifyTree(root) {
  const names = [];
  async function walk(path, prefix = '') {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe directory: ${path}`);
    for (const entry of await readdir(path)) {
      const name = prefix + entry;
      const full = join(path, entry);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error(`Symlink rejected: ${name}`);
      if (info.isDirectory()) {
        if (name !== 'assets') throw new Error(`Unexpected directory: ${name}`);
        await walk(full, name + '/');
      } else {
        if (!info.isFile() || !(name in manifest)) throw new Error(`Unapproved file: ${name}`);
        if (digest(await readFile(full)) !== manifest[name]) throw new Error(`Content changed: ${name}`);
        names.push(name);
      }
    }
  }
  await walk(root);
  if (names.length !== Object.keys(manifest).length) throw new Error('Public files missing');
  return names.sort();
}
