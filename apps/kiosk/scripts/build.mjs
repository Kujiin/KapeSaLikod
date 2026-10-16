import { copyFile, mkdir, mkdtemp, rename, rm, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { kiosk, verifyTree } from './files.mjs';

const root = fileURLToPath(kiosk);
const source = join(root, 'public');
const output = join(root, 'dist');
const names = await verifyTree(source);
// Refuse to delete an unexpected directory or follow a pre-existing symlink.
try {
  await lstat(output);
  await verifyTree(output, false);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const stage = await mkdtemp(join(root, '.build-'));
try {
  for (const directory of ['assets','shared','swaggar']) await mkdir(join(stage, directory));
  for (const name of names) await copyFile(join(source, name), join(stage, name));
  await verifyTree(stage);
  await rm(output, { recursive: true, force: true });
  await rename(stage, output);
  console.log(`Built ${names.length} approved files into apps/kiosk/dist`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
