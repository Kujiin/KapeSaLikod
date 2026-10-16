import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import { poolFor } from '../src/db.js';
import { hashPassword } from '../src/security.js';
import { cartTotal,orderPayload } from '../../kiosk/public/shared/cart.js';
const origin='http://127.0.0.1:4173';
test('PostgreSQL-backed API, authentication, catalog, orders, uploads and authorization',async t=>{
  const config=configuration(); const pool=poolFor(config);const app=await buildApp({config,pool});
  t.after(()=>app.close());
  const password=randomUUID()+'Test';
  const hash=await hashPassword(password);
  const {rows:[owner]}=await pool.query("INSERT INTO kape.admin_users(email,display_name,role,password_hash) VALUES('test-owner@example.test','Test Owner','owner',$1) RETURNING id",[hash]);
  let cookie;let csrf;
  async function call(method,url,body,options={}){
    const headers={origin,...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...options.headers};
    const response=await app.inject({method,url,payload:body,headers,remoteAddress:options.ip||'127.0.0.1'});
    if(options.status!==undefined)assert.equal(response.statusCode,options.status,response.body);
    return response;
  }
  await t.test('health, readiness, menu and exact original catalog',async()=>{
    await call('GET','/health',null,{status:200});await call('GET','/ready',null,{status:200});
    const menu=(await call('GET','/v1/menu',null,{status:200})).json();
    assert.equal(menu.products.length,21);assert.equal(menu.categories.length,3);assert.equal(menu.sizes.length,2);assert.equal(menu.products.flatMap(p=>p.variants).length,37);
    const legacy=await readFile(new URL('../../../script.js',import.meta.url),'utf8');
    const matches=[...legacy.matchAll(/name: '([^']+)', category: '([^']+)', prices: \[([^\]]+)\]/g)];assert.equal(matches.length,21);
    for(const [,name,category,prices]of matches){const p=menu.products.find(p=>p.name===name);assert.equal(p.category,category);assert.deepEqual(p.variants.map(v=>v.price_centavos),prices.split(',').map(n=>Number(n)*100));assert.deepEqual(p.variants.map(v=>v.label),p.variants.length===2?['12 oz','16 oz']:['16 oz']);}
    assert.equal(cartTotal([{price_centavos:7500,quantity:2},{price_centavos:9000,quantity:1}]),24000);
    assert.deepEqual(orderPayload('Dine In',[{variant_id:'1',quantity:2}]),{order_type:'Dine In',items:[{variant_id:'1',quantity:2}]});
  });
  await t.test('deny unauthenticated access, foreign origins and credential leakage',async()=>{
    for(const path of ['catalog','orders','settings','accounts','audit','overview','session'])await call('GET','/v1/admin/'+path,null,{status:401});
    await call('POST','/v1/auth/login',{email:'test-owner@example.test',password},{headers:{origin:'https://evil.test'},status:403});
    const login=await call('POST','/v1/auth/login',{email:'test-owner@example.test',password},{status:200});
    assert(!login.body.includes('password_hash'));assert(!login.body.includes(password));
    cookie=login.headers['set-cookie'].split(';')[0];csrf=login.json().csrf;
    assert.match(login.headers['set-cookie'],/HttpOnly/i);assert.match(login.headers['set-cookie'],/SameSite=Strict/i);
    await call('POST','/v1/admin/categories',{name:'Forbidden',sort_order:0,is_active:true},{headers:{'x-csrf-token':''},status:403});
    const {rows:[session]}=await pool.query('SELECT token_hash FROM kape.admin_sessions WHERE admin_user_id=$1',[owner.id]);assert.equal(session.token_hash.length,32);assert(!session.token_hash.equals(Buffer.from(cookie.split('=')[1],'hex')));
  });
  let variant,order;
  await t.test('server prices, concurrent idempotency, bad inputs and unpaid order',async()=>{
    const menu=(await call('GET','/v1/menu')).json();variant=menu.products[0].variants[0];
    const body={order_type:'Dine In',items:[{variant_id:variant.id,quantity:2}]};const key=randomUUID();
    const [a,b]=await Promise.all([call('POST','/v1/orders',body,{headers:{'idempotency-key':key},status:200}),call('POST','/v1/orders',body,{headers:{'idempotency-key':key},status:200})]);
    order=a.json();assert.equal(order.id,b.json().id);assert.equal(Number(order.total_centavos),variant.price_centavos*2);assert.equal(order.payment_status,'unpaid');assert.match(order.reference,/^KapeSaLikod-[0-9]{7}$/);assert.equal(order.reference,'KapeSaLikod-0000001');assert.equal(order.history.length,1);
    await call('POST','/v1/orders',{...body,order_type:'Take Out'},{headers:{'idempotency-key':key},status:409});
    await call('POST','/v1/orders',{...body,total_centavos:1},{headers:{'idempotency-key':randomUUID()},status:400});
    for(const quantity of [0,-1,100,1.5])await call('POST','/v1/orders',{...body,items:[{variant_id:variant.id,quantity}]},{headers:{'idempotency-key':randomUUID()},status:400});
    await call('POST','/v1/orders',{order_type:'Dine In',items:[]},{headers:{'idempotency-key':randomUUID()},status:400});
    await call('POST','/v1/orders',body,{status:400});
  });
  await t.test('sequential references are unique under concurrency and never reuse rolled-back numbers',async()=>{
    const body={order_type:'Take Out',items:[{variant_id:variant.id,quantity:1}]};
    const responses=await Promise.all(Array.from({length:3},()=>call('POST','/v1/orders',body,{headers:{'idempotency-key':randomUUID()},status:200})));
    assert.deepEqual(responses.map(r=>r.json().reference).sort(),['KapeSaLikod-0000002','KapeSaLikod-0000003','KapeSaLikod-0000004']);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("INSERT INTO kape.orders(order_type,total_centavos) VALUES('Take Out',0)");
      await client.query('ROLLBACK');
    }finally{client.release();}
    const next=(await call('POST','/v1/orders',body,{headers:{'idempotency-key':randomUUID()},status:200})).json();
    assert.equal(next.reference,'KapeSaLikod-0000006');
  });
  let createdProduct;
  await t.test('product/category CRUD, availability, price history and uploads',async()=>{
    let menu=(await call('GET','/v1/admin/catalog')).json();
    const category=(await call('POST','/v1/admin/categories',{name:'Test category',sort_order:10,is_active:true},{status:200})).json();
    const body={name:'Test drink',category_id:category.id,description:'Test description',sort_order:22,is_active:true,variants:[{size_id:menu.sizes[0].id,price_centavos:12345,is_active:true}]};
    createdProduct=(await call('POST','/v1/admin/products',body,{status:200})).json();
    await call('PUT','/v1/admin/products/'+createdProduct.id,{...body,name:'Updated test drink',variants:[{...body.variants[0],price_centavos:15000}]},{status:200});
    // Update an original product price after an order; snapshots must remain fixed.
    const p=menu.products[0];await call('PUT','/v1/admin/products/'+p.id,{name:p.name,category_id:p.category_id,description:'',sort_order:p.sort_order,is_active:true,variants:p.variants.map(v=>({size_id:v.size_id,price_centavos:v.price_centavos+100,is_active:v.is_active}))},{status:200});
    const historic=(await call('GET','/v1/admin/orders/'+order.id,{},{status:200})).json();assert.equal(historic.items[0].unit_price_centavos,variant.price_centavos);
    const boundary='ksl-test-boundary';
    async function upload(buffer,filename='safe.png',type='image/png'){
      const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),buffer,Buffer.from(`\r\n--${boundary}--\r\n`)]);
      return call('POST',`/v1/admin/products/${createdProduct.id}/image`,payload,{headers:{'content-type':`multipart/form-data; boundary=${boundary}`}});
    }
    const bad=await upload(Buffer.from('<svg onload="alert(1)"></svg>'));assert.equal(bad.statusCode,400,bad.body);
    const oversized=await upload(Buffer.alloc(5*1024*1024+1));assert.equal(oversized.statusCode,413,oversized.body);
    const image=await readFile(new URL('../../kiosk/public/assets/coffee-01.png',import.meta.url));
    const uploaded=await upload(image,'../../danger.png','application/octet-stream');assert.equal(uploaded.statusCode,200,uploaded.body);
    const imagePath=uploaded.json().image_path;assert.match(imagePath,/^\/api\/v1\/images\/[a-f0-9-]+\.webp$/);
    const picture=await call('GET',imagePath.replace('/api',''),null,{status:200});assert.equal(picture.headers['content-type'],'image/webp');
    await call('POST',`/v1/admin/products/${createdProduct.id}/archive`,null,{status:200});
    menu=(await call('GET','/v1/admin/catalog')).json();const archived=menu.products.find(p=>p.id===createdProduct.id);
    await call('POST','/v1/orders',{order_type:'Take Out',items:[{variant_id:archived.variants[0].id,quantity:1}]},{headers:{'idempotency-key':randomUUID()},status:409});
    await call('PUT','/v1/admin/categories/'+category.id,{name:'Disabled test category',sort_order:20,is_active:false},{status:200});
    await call('DELETE','/v1/admin/categories/'+category.id,null,{status:404});
  });
  await t.test('order status, explicit cash payment, reporting and audit',async()=>{
    const path='/v1/admin/orders/'+order.id;
    await call('POST',path+'/status',{status:'completed'},{status:409});
    for(const s of ['preparing','ready'])await call('POST',path+'/status',{status:s},{status:200});
    await call('POST',path+'/status',{status:'completed'},{status:409});
    await call('POST',path+'/cash-payment',null,{status:200});await call('POST',path+'/cash-payment',null,{status:409});
    await call('POST',path+'/status',{status:'cancelled'},{status:409});
    await call('POST',path+'/status',{status:'completed'},{status:200});
    const result=(await call('GET',path)).json();assert.deepEqual(result.history.map(h=>h.status),['pending','preparing','ready','completed']);assert.equal(result.payment_status,'paid');
    const report=(await call('GET','/v1/admin/overview')).json();assert.equal(Number(report.counts.collected_centavos),Number(order.total_centavos));assert.equal(report.sales.length,1);
    const audit=(await call('GET','/v1/admin/audit')).json();assert(audit.events.some(e=>e.action==='cash_payment_recorded'));assert(!JSON.stringify(audit).includes(password));
    const searched=(await call('GET','/v1/admin/orders?search='+order.reference)).json();assert.equal(searched.orders.length,1);
  });
  await t.test('settings, accounts, staff authorization and last owner guard',async()=>{
    await call('PUT','/v1/admin/settings',{name:'Test café',counter_note:'Pay at counter',timezone:'Mars/Invalid'},{status:400});
    await call('PUT','/v1/admin/settings',{name:'Kape sa Likod',counter_note:'Please pay at the counter.',timezone:'Asia/Manila'},{status:200});
    await call('PUT','/v1/admin/accounts/'+owner.id,{display_name:'Test Owner',role:'staff',is_active:true},{status:409});
    await call('POST','/v1/admin/accounts',{email:'test-staff@example.test',display_name:'Test Staff',role:'staff',password},{status:200});
    const ownerCookie=cookie,ownerCsrf=csrf;
    cookie=null;csrf=null;
    const login=await call('POST','/v1/auth/login',{email:'test-staff@example.test',password},{status:200});cookie=login.headers['set-cookie'].split(';')[0];csrf=login.json().csrf;
    await call('GET','/v1/admin/accounts',null,{status:403});await call('GET','/v1/admin/audit',null,{status:403});
    await call('POST','/v1/admin/categories',{name:'Forbidden',sort_order:0,is_active:true},{status:403});
    await call('GET','/v1/admin/orders',null,{status:200});
    cookie=ownerCookie;csrf=ownerCsrf;
  });
  await t.test('password change revokes sessions and production cookies are secure',async()=>{
    const prodConfig={...config,production:true,cookieName:'__Host-ksl_session',origins:['https://kapesalikod.pages.dev']};
    const production=await buildApp({config:prodConfig});
    try{
      const result=await production.inject({method:'POST',url:'/v1/auth/login',headers:{origin:'https://kapesalikod.pages.dev'},payload:{email:'test-staff@example.test',password}});
      assert.equal(result.statusCode,200,result.body);assert.match(result.headers['set-cookie'],/^__Host-ksl_session=/);assert.match(result.headers['set-cookie'],/; Secure/);assert.match(result.headers['set-cookie'],/; Path=\//);assert(!result.headers['set-cookie'].includes('Domain='));
      const staffCookie=result.headers['set-cookie'].split(';')[0];
      const changed=await production.inject({method:'POST',url:'/v1/admin/password',headers:{origin:'https://kapesalikod.pages.dev',cookie:staffCookie,'x-csrf-token':result.json().csrf},payload:{current_password:password,new_password:randomUUID()}});
      assert.equal(changed.statusCode,200,changed.body);
      const expired=await production.inject({method:'GET',url:'/v1/admin/session',headers:{cookie:staffCookie}});assert.equal(expired.statusCode,401);
    }finally{await production.close();}
    assert.throws(()=>configuration({...process.env,PGHOST:'192.0.2.1'}));
    assert.throws(()=>configuration({...process.env,PGUSER:'postgres'}));
  });
  await t.test('runtime has no DDL, ownership, catalog DELETE, item UPDATE or owner membership',async()=>{
    for(const sql of ['CREATE TABLE kape.forbidden(id int)','CREATE TEMP TABLE forbidden(id int)','DELETE FROM kape.products','UPDATE kape.order_items SET quantity=2','SET ROLE kape_sa_likod_owner','SELECT * FROM kape.schema_migrations',"SELECT setval('kape.order_reference_seq',1)"])await assert.rejects(pool.query(sql));
  });
  await t.test('logout, expired sessions, brute-force limiting and safe database outage response',async()=>{
    await call('POST','/v1/admin/logout',null,{status:200});await call('GET','/v1/admin/session',null,{status:401});cookie=null;csrf=null;
    const login=await call('POST','/v1/auth/login',{email:'test-owner@example.test',password},{ip:'127.0.0.2',status:200});cookie=login.headers['set-cookie'].split(';')[0];csrf=login.json().csrf;
    await pool.query("UPDATE kape.admin_sessions SET revoked_at=now() WHERE admin_user_id=$1",[owner.id]);
    await call('GET','/v1/admin/session',null,{status:401});cookie=null;csrf=null;
    for(let i=0;i<5;i++)await call('POST','/v1/auth/login',{email:'unknown@example.test',password:'wrong'},{ip:'127.0.0.3',status:401});
    await call('POST','/v1/auth/login',{email:'unknown@example.test',password:'wrong'},{ip:'127.0.0.3',status:429});
    const failing=await buildApp({config,pool:{query:async()=>{throw Object.assign(new Error('secret host password'),{code:'ECONNREFUSED'});},end:async()=>{}}});
    const response=await failing.inject({method:'GET',url:'/v1/menu'});assert.equal(response.statusCode,503);assert(!response.body.includes('secret'));await failing.close();
  });
});
