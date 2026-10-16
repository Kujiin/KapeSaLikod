import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,copyFile,writeFile,rm,symlink,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const exec=promisify(execFile);const root=fileURLToPath(new URL('../',import.meta.url));
test('artifact safety: reject secrets, SQL, altered files and symlinks',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ksl-build-test-'));
  try{
    const manifest=JSON.parse(await readFile(join(root,'public-files.json'),'utf8'));
    for(const dir of ['public','public/assets','public/shared','public/swaggar','scripts'])await mkdir(join(directory,dir),{recursive:true});
    for(const name of Object.keys(manifest))await copyFile(join(root,'public',name),join(directory,'public',name));
    for(const name of ['build.mjs','files.mjs'])await copyFile(join(root,'scripts',name),join(directory,'scripts',name));
    await copyFile(join(root,'public-files.json'),join(directory,'public-files.json'));
    const build=()=>exec(process.execPath,[join(directory,'scripts/build.mjs')]);
    await build();assert(await readFile(join(directory,'dist/swaggar/index.html'),'utf8'));
    for(const name of ['.env','database.sql','server.js']){
      await writeFile(join(directory,'public',name),'must never publish');await assert.rejects(build());await rm(join(directory,'public',name));
    }
    await writeFile(join(directory,'public/script.js'),'modified without manifest review');await assert.rejects(build());
    await rm(join(directory,'public/script.js'));await symlink(join(root,'public/script.js'),join(directory,'public/script.js'));await assert.rejects(build());
  }finally{await rm(directory,{recursive:true,force:true});}
});
