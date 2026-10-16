import {dialogController} from '../shared/dialogs.js';
import {el,money,badge,label,table,empty,panel,editor} from './ui.js';
const transitions={pending:['accepted','preparing','cancelled'],accepted:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['completed','cancelled'],completed:[],cancelled:[]};
export async function orderDetail(ctx,id){
  try{
    const order=await ctx.api(`/v1/admin/orders/${id}`);
    const content=el('div',{},el('p',{text:`${order.order_type} · ${new Date(order.created_at).toLocaleString()}`}),badge(order.status),document.createTextNode(' '),badge(order.payment_status),
      table(['Drink','Size','Qty','Amount'],order.items.map(i=>[i.product_name,i.size_label,String(i.quantity),money(i.line_total_centavos)])),el('p',{class:'order-total',text:money(order.total_centavos)}),
      el('p',{class:'muted',text:'Cash payment is recorded only after a staff member confirms it was received.'}));
    const actions=el('div',{class:'form-actions'});const error=el('p',{role:'alert'});
    async function action(path,body){try{actions.querySelectorAll('button').forEach(b=>b.disabled=true);await ctx.api(`/v1/admin/orders/${id}/${path}`,{method:'POST',body});await orderDetail(ctx,id);await ctx.refresh();}catch(e){error.textContent=e.message;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}}
    for(const status of transitions[order.status])actions.append(el('button',{text:`Mark ${label(status)}`,class:status==='cancelled'?'danger':'',onclick:()=>{if(confirm(`Mark order ${status}?`))action('status',{status});}}));
    if(order.payment_status==='unpaid'&&order.status!=='cancelled')actions.append(el('button',{class:'primary',text:'Record cash received',onclick:()=>{if(confirm(`Confirm you received ${money(order.total_centavos)} in cash? This records a real payment.`))action('cash-payment');}}));
    content.append(error,actions,el('h3',{text:'Status history'}),el('ol',{class:'history'},...order.history.map(h=>el('li',{text:`${label(h.status)} · ${new Date(h.created_at).toLocaleString()}`}))));
    const dialog=document.getElementById('editor');if(dialog.open)dialogController(document.querySelector('.admin-kiosk')).close(dialog);editor(order.reference,content);
  }catch(e){ctx.notice(e.message);}
}
export async function ordersView(ctx){
  let offset=0;const search=el('input',{type:'search',placeholder:'Search reference number','aria-label':'Search orders'});
  const status=el('select',{'aria-label':'Filter order status'},el('option',{value:'',text:'All statuses'}),...Object.keys(transitions).map(s=>el('option',{value:s,text:label(s)})));
  const list=el('div');const position=el('span',{text:'1–50'});
  const previous=el('button',{text:'Previous',disabled:true,onclick:()=>{offset=Math.max(0,offset-50);load();}});
  const next=el('button',{text:'Next',onclick:()=>{offset+=50;load();}});
  async function load(){try{
    const query=new URLSearchParams({offset});if(search.value)query.set('search',search.value);if(status.value)query.set('status',status.value);
    const {orders}=await ctx.api('/v1/admin/orders?'+query);
    list.replaceChildren(orders.length?table(['Reference','Type','Status','Payment','Total','Received',''],orders.map(o=>[o.reference,o.order_type,badge(o.status),badge(o.payment_status),money(o.total_centavos),new Date(o.created_at).toLocaleString(),el('button',{text:'View order',onclick:()=>orderDetail(ctx,o.id)})])):empty('No orders match this view.'));
    previous.disabled=offset===0;next.disabled=orders.length<50;position.textContent=orders.length?`${offset+1}–${offset+orders.length}`:'0 orders';
  }catch(e){ctx.notice(e.message);}}
  const apply=()=>{offset=0;load();};status.addEventListener('change',apply);
  search.addEventListener('keydown',event=>{if(event.key==='Enter')apply();});
  await load();ctx.poll=load;
  return panel('Order queue',el('div',{class:'toolbar'},search,status,el('button',{text:'Search / refresh',onclick:apply})),list,el('div',{class:'pager'},previous,position,next));
}
export async function overviewView(ctx){
  const data=await ctx.api('/v1/admin/overview');const c=data.counts;
  return el('div',{},el('div',{class:'stats'},...[
    ['Products',c.products],['Available',c.available],['Orders',c.orders],['Pending',c.pending],['Completed',c.completed],['Cash collected',money(c.collected_centavos)]
  ].map(([title,value])=>el('div',{class:'stat'},el('span',{text:title}),el('strong',{text:value})))),
  panel('Recent orders',data.recent.length?table(['Reference','Status','Payment','Total',''],data.recent.map(o=>[o.reference,badge(o.status),badge(o.payment_status),money(o.total_centavos),el('button',{text:'View',onclick:()=>orderDetail(ctx,o.id)})])):empty('No orders yet.')),
  panel('Recorded sales',el('p',{class:'muted',text:'Paid orders · Café timezone'}),data.sales.length?table(['Day','Payments','Cash collected'],data.sales.map(s=>[s.day.slice(0,10),String(s.payments),money(s.centavos)])):empty('No payments have been recorded.')));
}
