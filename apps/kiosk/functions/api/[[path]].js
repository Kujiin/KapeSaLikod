// Same-origin proxy: fixed server-side API_ORIGIN; no client-selected upstream.
export async function onRequest({request,env,params}) {
  if(!env.API_ORIGIN)return Response.json({error:'Ordering is not configured. Please ask at the counter.'},{status:503});
  let upstream;
  try {upstream=new URL(env.API_ORIGIN);if(upstream.protocol!=='https:'||upstream.pathname!=='/'||upstream.username||upstream.password||upstream.search||upstream.hash)throw Error();}
  catch{return Response.json({error:'Service configuration is invalid.'},{status:503});}
  const path=Array.isArray(params.path)?params.path.join('/'):params.path||'';
  if(!/^v1\/(menu|orders|auth\/login|admin(?:\/.*)?|images\/[a-f0-9-]+\.webp)$/.test(path)||path.includes('..')||path.includes('\\'))return new Response(null,{status:404});
  if(!['GET','POST','PUT','OPTIONS'].includes(request.method))return new Response(null,{status:405});
  const url=new URL('/'+path,upstream);url.search=new URL(request.url).search;
  const headers=new Headers();
  for(const name of ['Content-Type','Cookie','Origin','X-CSRF-Token','Idempotency-Key','Accept']){const value=request.headers.get(name);if(value)headers.set(name,value);}
  // Optional Cloudflare Access service credentials are encrypted Pages bindings.
  if(env.ACCESS_CLIENT_ID&&env.ACCESS_CLIENT_SECRET){headers.set('CF-Access-Client-Id',env.ACCESS_CLIENT_ID);headers.set('CF-Access-Client-Secret',env.ACCESS_CLIENT_SECRET);}
  try{
    const result=await fetch(url,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(result.status>=300&&result.status<400)return Response.json({error:'API routing needs attention.'},{status:502});
    const outgoing=new Headers();
    for(const name of ['Content-Type','Cache-Control','X-Content-Type-Options','Retry-After'])if(result.headers.has(name))outgoing.set(name,result.headers.get(name));
    for(const value of result.headers.getSetCookie())outgoing.append('Set-Cookie',value);
    return new Response(result.body,{status:result.status,headers:outgoing});
  }catch{return Response.json({error:'The cafe service is temporarily unreachable. Please retry.'},{status:503});}
}
