import {el,badge,label,table,empty,panel,input,select,checkbox,editor,submitForm} from './ui.js';
export async function settingsView(ctx){
  const settings=await ctx.api('/v1/admin/settings');
  const passwordForm=el('form',{},input('Current password','current_password','',{type:'password',required:true,autocomplete:'current-password',maxlength:128}),input('New password (12+ characters)','new_password','',{type:'password',required:true,minlength:12,maxlength:128,autocomplete:'new-password'}));
  const passwordError=el('p',{role:'alert'});passwordForm.append(el('button',{class:'primary',text:'Change password'}),passwordError);
  passwordForm.addEventListener('submit',async event=>{event.preventDefault();const data=new FormData(passwordForm);try{await ctx.api('/v1/admin/password',{method:'POST',body:Object.fromEntries(data)});passwordForm.reset();ctx.signedOut('Password updated. Sign in again.');}catch(e){passwordError.textContent=e.message;}});
  const cafe=panel('Café details',el('p',{text:settings.name}),el('p',{class:'muted',text:settings.counter_note}),el('small',{text:`Reporting timezone: ${settings.timezone}`}));
  if(['owner','manager'].includes(ctx.user.role))cafe.append(el('button',{text:'Edit café details',onclick:()=>{
    const form=el('form',{},input('Café name','name',settings.name,{required:true,maxlength:120}),input('Counter note','counter_note',settings.counter_note,{maxlength:500}),input('IANA timezone','timezone',settings.timezone,{required:true,maxlength:80}));
    editor('Café details',submitForm(form,'Save details',data=>ctx.api('/v1/admin/settings',{method:'PUT',body:Object.fromEntries(data)}),ctx));
  }}));
  return el('div',{class:'split'},cafe,panel('Account security',el('p',{class:'muted',text:'Changing your password ends all your existing sessions.'}),passwordForm));
}
export async function accountsView(ctx){
  const {accounts}=await ctx.api('/v1/admin/accounts');
  function edit(account){
    const form=el('form',{},input('Display name','display_name',account?.display_name||'',{required:true,maxlength:120}),select('Role','role',account?.role||'staff',[['staff','Staff'],['manager','Manager'],['owner','Owner']]));
    if(account)form.append(checkbox('Active account','is_active',account.is_active));
    else form.append(input('Email','email','',{type:'email',required:true,autocomplete:'off',maxlength:254}),input('Initial password (12+ characters)','password','',{type:'password',required:true,minlength:12,maxlength:128,autocomplete:'new-password'}));
    editor(account?'Edit account':'Create staff account',submitForm(form,'Save account',async data=>{
      const body=account?{display_name:data.get('display_name'),role:data.get('role'),is_active:data.has('is_active')}:{display_name:data.get('display_name'),role:data.get('role'),email:data.get('email'),password:data.get('password')};
      await ctx.api('/v1/admin/accounts'+(account?'/'+account.id:''),{method:account?'PUT':'POST',body});form.reset();
      if(account?.id===ctx.user.id)ctx.signedOut('Account updated. Sign in again.');
    },ctx));
  }
  return panel('Staff accounts',el('div',{class:'toolbar'},el('p',{class:'muted',text:'Account changes sign that user out.'}),el('button',{class:'primary',text:'Create account',onclick:()=>edit()})),table(['Name','Email','Role','Status',''],accounts.map(a=>[a.display_name,a.email,label(a.role),badge(a.is_active?'available':'unavailable'),el('button',{text:'Edit',onclick:()=>edit(a)})])));
}
export async function auditView(ctx){
  let offset=0;const list=el('div');const back=el('button',{text:'Previous',disabled:true,onclick:()=>{offset=Math.max(0,offset-50);load();}});const next=el('button',{text:'Next',onclick:()=>{offset+=50;load();}});
  async function load(){try{const {events}=await ctx.api('/v1/admin/audit?offset='+offset);back.disabled=!offset;next.disabled=events.length<50;list.replaceChildren(events.length?table(['When','Staff','Action','Entity','Details'],events.map(e=>[new Date(e.created_at).toLocaleString(),e.actor||'System',label(e.action),`${e.entity_type} · ${e.entity_id}`,el('details',{},el('summary',{text:'Details'}),el('pre',{text:JSON.stringify(e.metadata,null,2)}))])):empty('No administrative activity yet.'));}catch(e){ctx.notice(e.message);}}
  await load();return panel('Audit history',list,el('div',{class:'pager'},back,next));
}
