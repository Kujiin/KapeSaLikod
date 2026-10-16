import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { managers, fail } from '../security.js';
import { id, parse } from '../validation.js';
import { transaction, audit } from '../db.js';
sharp.concurrency(1);
sharp.cache({memory:16,files:0,items:32});
export const imageName=/^[a-f0-9-]{36}\.webp$/;
export function publicImageRoutes(app,config) {
  app.get('/v1/images/:name',async(request,reply)=>{
    if(!imageName.test(request.params.name)) fail(404,'Image not found.');
    try {
      const buffer=await readFile(join(config.uploadDir,request.params.name));
      return reply.header('Cache-Control','public,max-age=31536000,immutable').type('image/webp').send(buffer);
    } catch(error) { if(error.code==='ENOENT') fail(404,'Image not found.');throw error; }
  });
}
export function imageRoutes(app,pool,config) {
  app.post('/v1/admin/products/:id/image',{preHandler:managers},async request=>{
    const key=parse(id,request.params.id);
    const part=await request.file();
    if(!part) fail(400,'Choose one PNG, JPEG or WebP image.');
    const input=await part.toBuffer();
    const signature = input.subarray(0,12);
    const png=signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=signature.subarray(0,3).equals(Buffer.from([255,216,255]));
    const webp=signature.subarray(0,4).toString()==='RIFF'&&signature.subarray(8,12).toString()==='WEBP';
    if(!png&&!jpeg&&!webp)fail(400,'Choose a PNG, JPEG or WebP image.');
    let output;
    try {
      const processor=sharp(input,{limitInputPixels:16000000,animated:false,failOn:'warning'});
      const info=await processor.metadata();
      if(!['png','jpeg','webp'].includes(info.format)|| (info.pages||1)>1) fail(400,'Choose a static PNG, JPEG or WebP image.');
      output=await processor.rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
    } catch(error) { if(error.statusCode) throw error;fail(400,'This image cannot be decoded safely.'); }
    const filename=`${randomUUID()}.webp`;
    await mkdir(config.uploadDir,{recursive:true,mode:0o750});
    await writeFile(join(config.uploadDir,filename),output,{flag:'wx',mode:0o640});
    try {
      return await transaction(pool,async client=>{
        const {rows:[row]}=await client.query('UPDATE kape.products SET image_path=$1 WHERE id=$2 RETURNING id,image_path',[`/api/v1/images/${filename}`,key]);
        if(!row) fail(404,'Product not found.');
        await audit(client,request.admin,'image_replaced','product',key,{filename});return row;
      });
    } catch(error) {await unlink(join(config.uploadDir,filename));throw error;}
    // Old images are retained for cache/read races and removed by the reviewed GC command.
  });
}
