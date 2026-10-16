import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve,extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium,expect } from '../../kiosk/node_modules/@playwright/test/index.mjs';
import { buildApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import { poolFor } from '../src/db.js';
import { hashPassword } from '../src/security.js';
const root=fileURLToPath(new URL('../../kiosk/dist/',import.meta.url));
const artifacts=fileURLToPath(new URL('./artifacts/',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'};
test('real browser: kiosk, retries, original welcome appearance and /swaggar administration',async t=>{
  const config=configuration(),pool=poolFor(config),app=await buildApp({config,pool});
  const password=randomUUID()+'Test';
  await pool.query("INSERT INTO kape.admin_users(email,display_name,role,password_hash) VALUES('browser@example.test','Browser Owner','owner',$1)",[await hashPassword(password)]);
  const server=createServer(async(req,res)=>{
    try{
      if(req.url.startsWith('/api/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const response=await app.inject({method:req.method,url:req.url.slice(4),headers:req.headers,payload:chunks.length?Buffer.concat(chunks):undefined});
        res.writeHead(response.statusCode,response.headers);res.end(response.rawPayload);return;
      }
      let path=new URL(req.url,'http://127.0.0.1:4173').pathname;
      if(path==='/legacy'){
        const original=await readFile(new URL('../../../index.html',import.meta.url),'utf8');
        res.writeHead(200,{'content-type':'text/html'});res.end(original.replace('<head>','<head><base href="/">').replace('<script src="script.js" defer></script>',''));return;
      }
      if(path.endsWith('/'))path+='index.html';
      const full=resolve(root,'.'+decodeURIComponent(path));
      if(!full.startsWith(root))throw Error();
      const body=await readFile(full);res.writeHead(200,{'content-type':types[extname(full)]||'application/octet-stream'});res.end(body);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4173,'127.0.0.1',resolve);});
  let browser;
  t.after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));await app.close();});
  browser=await chromium.launch({headless:true});await mkdir(artifacts,{recursive:true});
  const context=await browser.newContext({viewport:{width:768,height:1024},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByRole('button',{name:'Touch to Start'})).toBeVisible();
  await page.screenshot({path:artifacts+'kiosk-welcome.png'});
  const originalWelcome=await page.locator('#welcome').evaluate(el=>el.innerHTML);
  const originalBounds=await page.locator('#welcome').boundingBox();
  await page.goto('http://127.0.0.1:4173/legacy');
  assert.equal(await page.locator('#welcome').evaluate(el=>el.innerHTML),originalWelcome);
  assert.deepEqual(await page.locator('#welcome').boundingBox(),originalBounds);
  await page.goto('http://127.0.0.1:4173/');await page.getByRole('button',{name:'Touch to Start'}).click();
  await page.getByRole('button',{name:'Dine In',exact:true}).click();await page.getByRole('button',{name:'Continue to Menu'}).click();
  await expect(page.locator('.product')).toHaveCount(21);
  await page.getByRole('button',{name:'Matcha',exact:true}).click();await expect(page.locator('.product')).toHaveCount(9);
  await page.getByRole('button',{name:'All drinks',exact:true}).click();
  await page.getByRole('button',{name:'Choose Signature Choco',exact:true}).click();await page.getByRole('button',{name:/12 oz/}).click();
  await page.getByRole('button',{name:/Review order/}).click();await expect(page.locator('#cart-items')).toContainText('Signature Choco');
  await page.getByRole('button',{name:'Increase Signature Choco',exact:true}).click();
  let key;let created;
  await page.route('**/api/v1/orders',async route=>{
    key=route.request().headers()['idempotency-key'];const response=await route.fetch();created=(await response.json()).id;await route.abort('failed');
  },{times:1});
  await page.getByRole('button',{name:'Place unpaid order',exact:true}).click();await expect(page.locator('#cart-message')).toContainText('Retry this same order');
  const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ksl_pending')));assert.equal(pending.key,key);
  await page.reload();await expect(page.getByRole('button',{name:'Retry same order',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Retry same order',exact:true}).click();await expect(page.locator('#confirmation')).toBeVisible();
  const reference=await page.locator('#order-reference').textContent();assert.match(reference,/KSL-/);
  const {rows:[{count}]}=await pool.query('SELECT count(*) FROM kape.orders WHERE id=$1',[created]);assert.equal(Number(count),1);
  await page.screenshot({path:artifacts+'kiosk-confirmation.png'});
  await page.getByRole('button',{name:'Start a new order'}).click();await expect(page.locator('#welcome')).toBeVisible();
  await page.goto('http://127.0.0.1:4173/swaggar/');await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  await page.getByLabel('Email',{exact:true}).fill('browser@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();await page.screenshot({path:artifacts+'admin-overview.png'});
  await page.getByRole('button',{name:'Products',exact:true}).click();await expect(page.getByRole('heading',{name:'Your menu',exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'Search products'}).fill('Signature Choco');await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Description',{exact:true}).fill('Browser-tested description');await page.getByRole('button',{name:'Save product',exact:true}).click();await expect(page.locator('#editor')).not.toBeVisible();
  await page.getByRole('button',{name:'Orders',exact:true}).click();await page.getByRole('searchbox',{name:'Search orders'}).fill(reference);await page.getByRole('button',{name:'Search / refresh',exact:true}).click();
  await expect(page.locator('#content')).toContainText(reference);await page.getByRole('button',{name:'View order',exact:true}).click();await expect(page.locator('#editor')).toContainText('Signature Choco');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:artifacts+'admin-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Dashboard must fit mobile viewport');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();
  await page.goto('http://127.0.0.1:4173/');await page.route('**/api/v1/menu',route=>route.abort('internetdisconnected'));
  await page.reload();await page.getByRole('button',{name:'Touch to Start'}).click();await page.getByRole('button',{name:'Take Out',exact:true}).click();await page.getByRole('button',{name:'Continue to Menu'}).click();
  await expect(page.locator('#menu-state')).toContainText('menu is unavailable');await expect(page.locator('#open-cart')).not.toBeVisible();
  assert.deepEqual(errors,[]);
});
