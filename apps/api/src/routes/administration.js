import { z, object, text, email, password, uuid, parse } from '../validation.js';
import { owners, managers, hashPassword, fail } from '../security.js';
import { transaction, audit } from '../db.js';
export function administrationRoutes(app,pool) {
  app.get('/v1/admin/overview',async()=>{
    const {rows:[counts]}=await pool.query(`SELECT
      (SELECT count(*) FROM kape.products) AS products,
      (SELECT count(*) FROM kape.products p JOIN kape.categories c ON c.id=p.category_id WHERE p.is_active AND c.is_active AND EXISTS (SELECT FROM kape.product_variants v WHERE v.product_id=p.id AND v.is_active)) AS available,
      (SELECT count(*) FROM kape.orders) AS orders,
      (SELECT count(*) FROM kape.orders WHERE status='pending') AS pending,
      (SELECT count(*) FROM kape.orders WHERE status='completed') AS completed,
      (SELECT coalesce(sum(amount_centavos),0) FROM kape.payments WHERE status='paid') AS collected_centavos`);
    const {rows:sales}=await pool.query(`SELECT (p.created_at AT TIME ZONE s.timezone)::date AS day,sum(p.amount_centavos) AS centavos,count(*) AS payments
      FROM kape.payments p CROSS JOIN kape.cafe_settings s WHERE p.status='paid'
      GROUP BY day ORDER BY day DESC LIMIT 30`);
    const {rows:recent}=await pool.query('SELECT id,reference,status,payment_status,total_centavos,created_at FROM kape.orders ORDER BY created_at DESC LIMIT 8');
    return {counts:{...counts,unavailable:Number(counts.products)-Number(counts.available)},sales,recent};
  });
  app.get('/v1/admin/settings',async()=> (await pool.query('SELECT name,counter_note,timezone FROM kape.cafe_settings WHERE id=true')).rows[0]);
  app.put('/v1/admin/settings',{preHandler:managers},async request=>{
    const body=parse(object({name:text(),counter_note:z.string().trim().max(500),timezone:text(80)}),request.body);
    try { new Intl.DateTimeFormat('en',{timeZone:body.timezone}); } catch { fail(400,'Choose a valid IANA timezone.'); }
    const {rows:[tz]}=await pool.query('SELECT name FROM pg_timezone_names WHERE name=$1',[body.timezone]);
    if(!tz) fail(400,'Timezone is not available on the database.');
    return transaction(pool,async client=>{
      const {rows:[row]}=await client.query('UPDATE kape.cafe_settings SET name=$1,counter_note=$2,timezone=$3 WHERE id=true RETURNING name,counter_note,timezone',[body.name,body.counter_note,body.timezone]);
      await audit(client,request.admin,'updated','settings','cafe',body);return row;
    });
  });
  app.get('/v1/admin/audit',{preHandler:managers},async request=>{
    const {offset}=parse(object({offset:z.coerce.number().int().min(0).max(100000).default(0)}),request.query);
    const {rows}=await pool.query(`SELECT e.id,e.action,e.entity_type,e.entity_id,e.metadata,e.created_at,u.display_name AS actor
      FROM kape.audit_events e LEFT JOIN kape.admin_users u ON u.id=e.actor_admin_id ORDER BY e.created_at DESC LIMIT 50 OFFSET $1`,[offset]);return {events:rows};
  });
  app.get('/v1/admin/accounts',{preHandler:owners},async()=>({accounts:(await pool.query('SELECT id,email,display_name,role,is_active,created_at FROM kape.admin_users ORDER BY created_at')).rows}));
  app.post('/v1/admin/accounts',{preHandler:owners},async request=>{
    const body=parse(object({email,display_name:text(),role:z.enum(['owner','manager','staff']),password}),request.body);
    const hash=await hashPassword(body.password);
    return transaction(pool,async client=>{
      const {rows:[user]}=await client.query('INSERT INTO kape.admin_users(email,display_name,role,password_hash) VALUES($1,$2,$3,$4) RETURNING id,email,display_name,role,is_active',[body.email,body.display_name,body.role,hash]);
      await audit(client,request.admin,'created','admin_user',user.id,{email:user.email,role:user.role});return user;
    });
  });
  app.put('/v1/admin/accounts/:id',{preHandler:owners},async request=>{
    const key=parse(uuid,request.params.id);
    const body=parse(object({display_name:text(),role:z.enum(['owner','manager','staff']),is_active:z.boolean()}),request.body);
    return transaction(pool,async client=>{
      // Serialize owner changes to prevent concurrent removal of every owner.
      await client.query('SELECT pg_advisory_xact_lock(180018,990001)');
      const {rows:[before]}=await client.query('SELECT id,role,is_active FROM kape.admin_users WHERE id=$1 FOR UPDATE',[key]);
      if(!before) fail(404,'Account not found.');
      if(before.role==='owner'&&before.is_active&&(!body.is_active||body.role!=='owner')){
        const {rows:[{count}]}=await client.query("SELECT count(*) FROM kape.admin_users WHERE role='owner' AND is_active");
        if(Number(count)<=1) fail(409,'Keep at least one active owner.');
      }
      await client.query('UPDATE kape.admin_users SET display_name=$1,role=$2,is_active=$3 WHERE id=$4',[body.display_name,body.role,body.is_active,key]);
      await client.query('UPDATE kape.admin_sessions SET revoked_at=now() WHERE admin_user_id=$1 AND revoked_at IS NULL',[key]);
      await audit(client,request.admin,'updated','admin_user',key,body);return {ok:true};
    });
  });
}
