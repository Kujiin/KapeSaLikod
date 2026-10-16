import Fastify, {LogController} from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { readFile } from 'node:fs/promises';
import { configuration } from './config.js';
import { poolFor } from './db.js';
import { digest, fail } from './security.js';
import { authRoutes, authenticatedRoutes } from './routes/auth.js';
import { menu,catalogRoutes } from './routes/catalog.js';
import { publicOrderRoutes,adminOrderRoutes } from './routes/orders.js';
import { administrationRoutes } from './routes/administration.js';
import { publicImageRoutes,imageRoutes } from './routes/images.js';
export async function buildApp({config=configuration(),pool=poolFor(config),logger=false}={}) {
  const app=Fastify({logger,logController:new LogController({disableRequestLogging:true}),bodyLimit:65536,trustProxy:false,requestTimeout:15000});
  pool.on?.('error',error=>app.log.error({code:error.code||'database'},'Idle database connection failed'));
  app.decorateRequest('admin',null);
  await app.register(cookie);
  await app.register(cors,{origin:config.origins,credentials:true,methods:['GET','POST','PUT','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token','Idempotency-Key']});
  await app.register(rateLimit,{max:120,timeWindow:'1 minute',cache:5000});
  await app.register(multipart,{limits:{fileSize:5*1024*1024,files:1,fields:0,parts:1,headerPairs:50}});
  app.addHook('onRequest',async request=>{
    if(!['GET','HEAD','OPTIONS'].includes(request.method)&&!config.origins.includes(request.headers.origin)) fail(403,'Request origin is not allowed.');
  });
  app.addHook('onSend',async(request,reply,payload)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
    if(!request.url.startsWith('/v1/images/'))reply.header('Cache-Control','no-store');
    return payload;
  });
  app.setErrorHandler((error,request,reply)=>{
    let status=error.statusCode||500;let message=error.message;
    if(error instanceof ZodError){status=400;message='Check the supplied fields and try again.';}
    else if(['23505','23503','23514'].includes(error.code)){status=409;message='This change conflicts with existing data or database constraints.';}
    else if(['ECONNREFUSED','57P01','53300','ETIMEDOUT','08006','42P01','42703'].includes(error.code)){status=503;message='Service is temporarily unavailable. Please try again.';}
    else if(status>=500){message='Something went wrong. Please try again.';}
    if(status>=500) app.log.error({code:error.code||'internal',requestId:request.id},'Request failed');
    reply.code(status).send({error:message,request_id:request.id});
  });
  app.get('/health',async()=>({status:'ok'}));
  const migration=await readFile(new URL('../db/migrations/003_backend_features.sql',import.meta.url));
  app.get('/ready',async()=>{
    const {rows:[row]}=await pool.query("SELECT sha256 FROM kape.schema_migrations WHERE version='003_backend_features.sql'");
    if(row?.sha256!==digest(migration).toString('hex'))fail(503,'Database migration is not ready.');
    return {status:'ready'};
  });
  app.get('/v1/menu',async()=>menu(pool));
  authRoutes(app,pool,config);publicOrderRoutes(app,pool);publicImageRoutes(app,config);
  await authenticatedRoutes(app,pool,config,async admin=>{
    catalogRoutes(admin,pool);adminOrderRoutes(admin,pool);administrationRoutes(admin,pool);imageRoutes(admin,pool,config);
  });
  app.addHook('onClose',async()=>pool.end());
  return app;
}
