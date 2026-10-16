import {request} from '../shared/api.js';
import {productsView,categoriesView} from './catalog.js';
import {ordersView,overviewView} from './orders.js';
import {settingsView,accountsView,auditView} from './settings.js';
const views={overview:overviewView,orders:ordersView,products:productsView,categories:categoriesView,settings:settingsView,accounts:accountsView,audit:auditView};
let page='overview';let generation=0;
const ctx={user:null,csrf:null,poll:null,notice:message=>document.getElementById('notice').textContent=message,
  api:async(path,options={})=>{try{return await request(path,{...options,csrf:ctx.csrf,signal:AbortSignal.timeout(20000)});}catch(error){if(error.status===401)signedOut('Please sign in.');throw error;}},refresh:()=>render(),signedOut};
function signedOut(message=''){
  generation++;ctx.user=null;ctx.csrf=null;ctx.poll=null;
  document.getElementById('workspace').hidden=true;document.getElementById('login-view').hidden=false;
  document.getElementById('editor').close();document.getElementById('editor-content').replaceChildren();document.getElementById('content').replaceChildren();
  document.getElementById('login-error').textContent=message;
}
function signedIn(session){
  ctx.user=session.user;ctx.csrf=session.csrf;
  document.getElementById('login-view').hidden=true;document.getElementById('workspace').hidden=false;
  document.getElementById('identity').textContent=`${ctx.user.display_name} · ${ctx.user.role}`;
  document.querySelectorAll('[data-roles]').forEach(node=>node.hidden=!node.dataset.roles.split(' ').includes(ctx.user.role));
  page='overview';render();
}
async function render(){
  if(!ctx.user)return;const current=++generation;ctx.poll=null;ctx.notice('');
  document.getElementById('page-title').textContent=page==='audit'?'Audit history':page[0].toUpperCase()+page.slice(1);
  document.querySelectorAll('[data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
  try{const result=await views[page](ctx);if(current!==generation)return;document.getElementById('content').replaceChildren(result);document.getElementById('service-state').textContent='Connected';}
  catch(error){ctx.notice(error.message);document.getElementById('service-state').textContent='Connection interrupted';}
}
document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{page=button.dataset.page;render();}));
document.getElementById('login-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;
  try{const body=Object.fromEntries(new FormData(form));const session=await request('/v1/auth/login',{method:'POST',body,signal:AbortSignal.timeout(20000)});form.reset();signedIn(session);}catch(error){document.getElementById('login-error').textContent=error.message;}finally{button.disabled=false;}
});
document.getElementById('logout').addEventListener('click',async()=>{try{await ctx.api('/v1/admin/logout',{method:'POST'});signedOut('Signed out.');}catch(error){ctx.notice(error.message);}});
setInterval(async()=>{if(!ctx.user||document.hidden)return;if(page==='orders'&&ctx.poll)await ctx.poll();else if(page==='overview'&&!document.getElementById('editor').open)await render();},10000);
try{signedIn(await request('/v1/admin/session'));}catch{signedOut();}
