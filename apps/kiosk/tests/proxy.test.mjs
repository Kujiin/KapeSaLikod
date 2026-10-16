import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
test('Pages proxy: fixed HTTPS upstream, safe headers, no redirects or missing-config success',async()=>{
  const native=globalThis.fetch;
  const request=new Request('https://kapesalikod.pages.dev/api/v1/admin/session',{headers:{cookie:'test-cookie','x-untrusted-secret':'do not forward'}});
  let forwarded;
  try{
    globalThis.fetch=async(url,options)=>{forwarded={url,options};return new Response('{"ok":true}',{headers:{'content-type':'application/json','set-cookie':'session=opaque; HttpOnly; Secure; Path=/'}});};
    const response=await onRequest({request,env:{API_ORIGIN:'https://api.example.test',ACCESS_CLIENT_ID:'test-id',ACCESS_CLIENT_SECRET:'test-only-service-token'},params:{path:['v1','admin','session']}});
    assert.equal(response.status,200);assert.equal(forwarded.url.href,'https://api.example.test/v1/admin/session');assert.equal(forwarded.options.headers.get('x-untrusted-secret'),null);assert.equal(forwarded.options.headers.get('cookie'),'test-cookie');assert.equal(forwarded.options.headers.get('CF-Access-Client-Secret'),'test-only-service-token');assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert(!response.headers.has('CF-Access-Client-Secret'));
    assert.equal((await onRequest({request,env:{},params:{path:['v1','menu']}})).status,503);
    assert.equal((await onRequest({request,env:{API_ORIGIN:'http://api.example.test'},params:{path:['v1','menu']}})).status,503);
    assert.equal((await onRequest({request,env:{API_ORIGIN:'https://api.example.test'},params:{path:['v1','..','secret']}})).status,404);
    globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://untrusted.example.test'}});
    assert.equal((await onRequest({request,env:{API_ORIGIN:'https://api.example.test'},params:{path:['v1','menu']}})).status,502);
    globalThis.fetch=async()=>{throw Error('upstream credentials should never reach browser');};
    const failed=await onRequest({request,env:{API_ORIGIN:'https://api.example.test'},params:{path:['v1','menu']}});assert.equal(failed.status,503);assert(!(await failed.text()).includes('credentials'));
  }finally{globalThis.fetch=native;}
});
