import { z, object, uuid, id, status, parse } from '../validation.js';
import { fail, digest } from '../security.js';
import { transaction, audit } from '../db.js';
const orderSchema=object({order_type:z.enum(['Dine In','Take Out']),items:z.array(object({variant_id:id,quantity:z.number().int().min(1).max(99)})).min(1).max(50)});
export const transitions={pending:['accepted','preparing','cancelled'],accepted:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['completed','cancelled'],completed:[],cancelled:[]};
export async function orderDetails(client,key) {
  const {rows:[order]}=await client.query('SELECT id,reference,order_type,status,payment_status,currency,total_centavos,created_at,updated_at FROM kape.orders WHERE id=$1',[key]);
  if(!order) fail(404,'Order not found.');
  const {rows:items}=await client.query('SELECT product_name,category_name,size_label,unit_price_centavos,quantity,line_total_centavos FROM kape.order_items WHERE order_id=$1 ORDER BY id',[key]);
  const {rows:history}=await client.query('SELECT status,created_at FROM kape.order_status_events WHERE order_id=$1 ORDER BY created_at,id',[key]);
  return {...order,items,history};
}
export function publicOrderRoutes(app,pool) {
  app.post('/v1/orders',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async request=>{
    const body=parse(orderSchema,request.body);const key=parse(uuid,request.headers['idempotency-key']);
    const items=[...body.items].sort((a,b)=>a.variant_id.localeCompare(b.variant_id));
    if(new Set(items.map(i=>i.variant_id)).size!==items.length) fail(400,'Combine quantities for the same size.');
    const hash=digest(JSON.stringify({order_type:body.order_type,items}));
    return transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
      const {rows:[prior]}=await client.query('SELECT request_hash,order_id FROM kape.idempotency_keys WHERE key=$1',[key]);
      if(prior){if(!prior.request_hash.equals(hash)) fail(409,'This submission key belongs to a different order.');return orderDetails(client,prior.order_id);}
      const {rows:variants}=await client.query(`SELECT v.id,v.price_centavos,p.name,c.name AS category,s.label
        FROM kape.product_variants v JOIN kape.products p ON p.id=v.product_id JOIN kape.categories c ON c.id=p.category_id JOIN kape.product_sizes s ON s.id=v.size_id
        WHERE v.id=ANY($1::bigint[]) AND v.is_active AND p.is_active AND c.is_active
        ORDER BY v.id FOR SHARE OF v,p,c`,[items.map(i=>i.variant_id)]);
      if(variants.length!==items.length) fail(409,'An item is unavailable. Refresh the menu and review your cart.');
      const selected=items.map(i=>({...i,...variants.find(v=>v.id===i.variant_id)}));
      const total=selected.reduce((sum,i)=>sum+i.price_centavos*i.quantity,0);
      const {rows:[order]}=await client.query('INSERT INTO kape.orders(order_type,total_centavos) VALUES($1,$2) RETURNING id',[body.order_type,total]);
      for(const item of selected) await client.query(`INSERT INTO kape.order_items(order_id,variant_id,product_name,category_name,size_label,unit_price_centavos,quantity) VALUES($1,$2,$3,$4,$5,$6,$7)`,[order.id,item.id,item.name,item.category,item.label,item.price_centavos,item.quantity]);
      await client.query("INSERT INTO kape.order_status_events(order_id,status) VALUES($1,'pending')",[order.id]);
      await client.query("INSERT INTO kape.idempotency_keys(key,request_hash,order_id,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[key,hash,order.id]);
      return orderDetails(client,order.id);
    });
  });
}
export function adminOrderRoutes(app,pool) {
  app.get('/v1/admin/orders',async request=>{
    const query=parse(object({status:status.optional(),search:z.string().max(50).optional(),offset:z.coerce.number().int().min(0).max(100000).default(0)}),request.query);
    const {rows}=await pool.query(`SELECT id,reference,order_type,status,payment_status,total_centavos,created_at FROM kape.orders
      WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR reference ILIKE '%' || $2 || '%') ORDER BY created_at DESC,id LIMIT 50 OFFSET $3`,[query.status||null,query.search||null,query.offset]);return {orders:rows};
  });
  app.get('/v1/admin/orders/:id',async request=>orderDetails(pool,parse(uuid,request.params.id)));
  app.post('/v1/admin/orders/:id/status',async request=>{
    const key=parse(uuid,request.params.id);const body=parse(object({status}),request.body);
    return transaction(pool,async client=>{
      const {rows:[row]}=await client.query('SELECT status,payment_status FROM kape.orders WHERE id=$1 FOR UPDATE',[key]);
      if(!row) fail(404,'Order not found.');
      if(!transitions[row.status].includes(body.status)) fail(409,'This status transition is not allowed.');
      if(body.status==='completed' && row.payment_status!=='paid') fail(409,'Record payment received at the counter before completing this order.');
      if(body.status==='cancelled' && row.payment_status==='paid') fail(409,'Paid orders require a reviewed refund process before cancellation.');
      await client.query('UPDATE kape.orders SET status=$1 WHERE id=$2',[body.status,key]);
      await client.query('INSERT INTO kape.order_status_events(order_id,status,actor_admin_id) VALUES($1,$2,$3)',[key,body.status,request.admin.id]);
      await audit(client,request.admin,'status_changed','order',key,{from:row.status,to:body.status});return orderDetails(client,key);
    });
  });
  app.post('/v1/admin/orders/:id/cash-payment',async request=>transaction(pool,async client=>{
    const key=parse(uuid,request.params.id);
    const {rows:[row]}=await client.query('SELECT * FROM kape.orders WHERE id=$1 FOR UPDATE',[key]);
    if(!row) fail(404,'Order not found.');
    if(row.payment_status==='paid'||row.status==='cancelled') fail(409,'This order cannot accept another payment.');
    if(Number(row.total_centavos)<=0) fail(409,'Zero-total orders need manager review.');
    await client.query("INSERT INTO kape.payments(order_id,method,status,amount_centavos,recorded_by) VALUES($1,'cash','paid',$2,$3)",[key,row.total_centavos,request.admin.id]);
    await client.query("UPDATE kape.orders SET payment_status='paid' WHERE id=$1",[key]);
    await audit(client,request.admin,'cash_payment_recorded','order',key,{amount_centavos:row.total_centavos});return orderDetails(client,key);
  }));
}
