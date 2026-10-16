import { z, object, text, id, cents, parse } from '../validation.js';
import { managers, fail } from '../security.js';
import { transaction, audit } from '../db.js';

export async function menu(pool, includeInactive=false) {
  const {rows:categories}=await pool.query('SELECT * FROM kape.categories WHERE ($1 OR is_active) ORDER BY sort_order,id',[includeInactive]);
  const {rows:products}=await pool.query(`SELECT p.*,c.name AS category,c.is_active AS category_active,
    coalesce((SELECT json_agg(json_build_object('id',v.id::text,'size_id',s.id::text,'label',s.label,'ounces',s.ounces,
      'price_centavos',v.price_centavos,'is_active',v.is_active) ORDER BY s.sort_order,s.id)
      FROM kape.product_variants v JOIN kape.product_sizes s ON s.id=v.size_id WHERE v.product_id=p.id), '[]') AS variants
    FROM kape.products p JOIN kape.categories c ON c.id=p.category_id
    WHERE ($1 OR c.is_active) ORDER BY c.sort_order,p.sort_order,p.id`,[includeInactive]);
  const {rows:sizes}=await pool.query('SELECT * FROM kape.product_sizes ORDER BY sort_order,id');
  const {rows:[settings]}=await pool.query('SELECT name,counter_note,timezone FROM kape.cafe_settings WHERE id=true');
  return {categories,products,sizes,settings};
}
const categorySchema=object({name:text(),sort_order:z.number().int().min(0).max(10000),is_active:z.boolean()});
const variantSchema=object({size_id:id,price_centavos:cents,is_active:z.boolean()});
const productSchema=object({name:text(),category_id:id,description:z.string().trim().max(2000),sort_order:z.number().int().min(0).max(10000),is_active:z.boolean(),variants:z.array(variantSchema).min(1).max(12)});
export function catalogRoutes(app,pool) {
  app.get('/v1/admin/catalog',async()=>menu(pool,true));
  app.post('/v1/admin/categories',{preHandler:managers},async request=>{
    const body=parse(categorySchema,request.body);
    return transaction(pool,async client=>{
      const {rows:[row]}=await client.query('INSERT INTO kape.categories(name,sort_order,is_active) VALUES($1,$2,$3) RETURNING *',[body.name,body.sort_order,body.is_active]);
      await audit(client,request.admin,'created','category',row.id);return row;
    });
  });
  app.put('/v1/admin/categories/:id',{preHandler:managers},async request=>{
    const key=parse(id,request.params.id); const body=parse(categorySchema,request.body);
    return transaction(pool,async client=>{
      const {rows:[row]}=await client.query('UPDATE kape.categories SET name=$1,sort_order=$2,is_active=$3 WHERE id=$4 RETURNING *',[body.name,body.sort_order,body.is_active,key]);
      if(!row) fail(404,'Category not found.');
      await audit(client,request.admin,'updated','category',key,body);return row;
    });
  });
  // Categories are disabled, never deleted; product/history FKs remain intact.
  for(const method of ['post','put']) app[method]('/v1/admin/products'+(method==='put'?'/:id':''),{preHandler:managers},async request=>{
    const body=parse(productSchema,request.body);
    if(new Set(body.variants.map(v=>v.size_id)).size!==body.variants.length) fail(400,'Each size can appear only once.');
    return transaction(pool,async client=>{
      let key=method==='put'?parse(id,request.params.id):null;
      const args=[body.name,body.category_id,body.description,body.sort_order,body.is_active];
      const {rows:[row]}=await client.query(key?
        'UPDATE kape.products SET name=$1,category_id=$2,description=$3,sort_order=$4,is_active=$5 WHERE id=$6 RETURNING *':
        'INSERT INTO kape.products(name,category_id,description,sort_order,is_active) VALUES($1,$2,$3,$4,$5) RETURNING *',key?[...args,key]:args);
      if(!row) fail(404,'Product not found.');key=row.id;
      await client.query('UPDATE kape.product_variants SET is_active=false WHERE product_id=$1',[key]);
      for(const v of body.variants) await client.query(`INSERT INTO kape.product_variants(product_id,size_id,price_centavos,is_active) VALUES($1,$2,$3,$4)
        ON CONFLICT(product_id,size_id) DO UPDATE SET price_centavos=EXCLUDED.price_centavos,is_active=EXCLUDED.is_active`,[key,v.size_id,v.price_centavos,v.is_active]);
      await audit(client,request.admin,method==='post'?'created':'updated','product',key,{name:body.name,variants:body.variants});
      return row;
    });
  });
  app.post('/v1/admin/products/:id/archive',{preHandler:managers},async request=>transaction(pool,async client=>{
    const key=parse(id,request.params.id);
    const {rowCount}=await client.query('UPDATE kape.products SET is_active=false WHERE id=$1',[key]);
    if(!rowCount) fail(404,'Product not found.');await audit(client,request.admin,'archived','product',key);return {ok:true};
  }));
}
