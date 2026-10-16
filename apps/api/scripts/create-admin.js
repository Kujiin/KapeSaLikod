#!/usr/bin/env node
// Run interactively as the dedicated API service identity after migrations.
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { configuration } from '../src/config.js';
import { poolFor,transaction,audit } from '../src/db.js';
import { hashPassword,fail } from '../src/security.js';
import { email as emailSchema,text,password as passwordSchema } from '../src/validation.js';
if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Use an interactive terminal; no command-line or piped passwords.');
function hidden(prompt){return new Promise((resolve,reject)=>{
  process.stdout.write(prompt);let value='';emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();
  function finish(){process.stdin.off('keypress',handler);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}
  function handler(str,key){if(key?.ctrl&&key.name==='c'){finish();reject(new Error('Cancelled'));}else if(key?.name==='return'){finish();resolve(value);}else if(key?.name==='backspace'){value=value.slice(0,-1);}else if(str&&!key?.ctrl&&value.length<129)value+=str;}
  process.stdin.on('keypress',handler);
});}
const pool=poolFor(configuration());
try{
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const email=emailSchema.parse(await rl.question('Owner email: '));
  const name=text().parse(await rl.question('Display name: '));rl.close();
  const password=passwordSchema.parse(await hidden('Password (hidden, 12–128 characters): '));
  if(password!==await hidden('Repeat password (hidden): '))throw new Error('Passwords do not match.');
  const hash=await hashPassword(password);
  await transaction(pool,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(180018,990001)');
    const {rows:[{count}]}=await client.query("SELECT count(*) FROM kape.admin_users WHERE role='owner' AND is_active");
    if(Number(count))fail(409,'An owner already exists. Use the dashboard for additional accounts.');
    const {rows:[user]}=await client.query("INSERT INTO kape.admin_users(email,display_name,password_hash,role) VALUES($1,$2,$3,'owner') RETURNING id",[email,name,hash]);
    await audit(client,user,'initial_owner_created','admin_user',user.id);
  });console.log('Initial owner created. No password was printed.');
}catch(error){console.error(error.statusCode===409?error.message:'Owner creation failed. Check inputs, database readiness and permissions. No secret details printed.');process.exitCode=1;}
finally{await pool.end();}
