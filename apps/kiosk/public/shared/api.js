// Same-origin Cloudflare Pages proxy. Never put credentials or an upstream secret here.
export const API='/api';
export async function request(path,{method='GET',body,csrf,key,signal}={}) {
  const headers={};
  if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
  if(csrf)headers['X-CSRF-Token']=csrf;
  if(key)headers['Idempotency-Key']=key;
  const response=await fetch(API+path,{method,headers,credentials:'same-origin',signal,
    body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({error:'The service returned an unexpected response.'}));
  if(!response.ok)throw Object.assign(new Error(data.error||'Please try again.'),{status:response.status});
  return data;
}
export const money=cents=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(cents)/100);
export function element(tag,attributes={},...children){
  const node=document.createElement(tag);
  for(const [key,value]of Object.entries(attributes)){
    if(key==='class')node.className=value;
    else if(key==='text')node.textContent=value;
    else if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
    else if(value!==false&&value!=null)node.setAttribute(key,value===true?'':String(value));
  }
  for(const child of children.flat())if(child!=null)node.append(child);
  return node;
}
export function imageURL(path){
  if(/^assets\/[a-z0-9-]+\.png$/.test(path||''))return '/'+path;
  if(/^\/api\/v1\/images\/[a-f0-9-]{36}\.webp$/.test(path||''))return path;
  return '/assets/coffee-01.png';
}
