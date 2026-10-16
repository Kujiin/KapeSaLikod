#!/usr/bin/env node
import { readdir,lstat,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { configuration } from '../src/config.js';
import { poolFor } from '../src/db.js';
import { imageName } from '../src/routes/images.js';
const config=configuration();const pool=poolFor(config);const apply=process.argv.includes('--apply');
try{
  const {rows}=await pool.query("SELECT image_path FROM kape.products WHERE image_path LIKE '/api/v1/images/%'");
  const referenced=new Set(rows.map(r=>r.image_path.split('/').pop()));let count=0;
  for(const name of await readdir(config.uploadDir)){
    if(!imageName.test(name)||referenced.has(name))continue;
    const path=join(config.uploadDir,name);const info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||Date.now()-info.mtimeMs<7*86400000)continue;
    count++;if(apply)await unlink(path);
  }
  console.log(`${apply?'Removed':'Dry run: would remove'} ${count} unreferenced images older than 7 days.`);
} catch {console.error('Cleanup failed; inspect storage/database access.');process.exitCode=1;}
finally{await pool.end();}
