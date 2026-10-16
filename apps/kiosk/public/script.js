import {request,money,element as el,imageURL} from './shared/api.js';
import {cartTotal,orderPayload} from './shared/cart.js';
let products=[];
let categories=[];
let cart=[];
let pending=null;
let submitting=false;
try { pending=JSON.parse(sessionStorage.getItem('ksl_pending')||'null'); if(pending){cart=pending.cart;} }catch{sessionStorage.removeItem('ksl_pending');}
let selectedOrderType = null;
let currentScreen = 'welcome';
let currentCategory = 'All';
let isTransitioning = false;
let toastTimeout;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function showScreen(screenId) {
  if (isTransitioning || screenId === currentScreen) return;
  window.clearTimeout(toastTimeout);
  document.getElementById('toast').classList.remove('visible');
  isTransitioning = true;
  const oldScreen = document.getElementById(currentScreen);
  const nextScreen = document.getElementById(screenId);
  // The welcome cups part before revealing the selection, connecting both screens.
  const duration = currentScreen === 'welcome' && !reducedMotion.matches ? 420 : 0;
  oldScreen.classList.add('departing');
  window.setTimeout(() => {
    oldScreen.hidden = true;
    oldScreen.classList.remove('departing');
    nextScreen.hidden = false;
    currentScreen = screenId;
    document.getElementById('header-label').textContent = screenId === 'menu' ? selectedOrderType : '';
    document.querySelector('main').scrollTo({ top: 0, behavior: 'instant' });
    nextScreen.querySelector('h1').focus({ preventScroll: true });
    if (screenId === 'menu') updateCategoryIndicator();
    isTransitioning = false;
  }, duration);
}

function selectOrderType(type) {
  if(pending){showMessage('Confirm your pending order first.');return;}
  selectedOrderType = type;
  document.querySelectorAll('.order-option').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.order === type));
  });
  document.getElementById('continue').disabled = false;
  // Reveal Continue inside the kiosk without moving keyboard focus off the choice.
  const scroller = document.querySelector('main');
  const action = document.querySelector('.selection-action');
  const revealPosition = scroller.scrollTop + action.getBoundingClientRect().bottom
    - scroller.getBoundingClientRect().bottom + 24;
  scroller.scrollTo({ top: Math.max(0, revealPosition), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}

function continueToMenu() {
  if (!selectedOrderType) return;
  showScreen('menu');
}

function renderProducts(category = 'All') {
  const visible=products.filter(p=>category==='All'||p.category===category);
  const title=document.getElementById('category-title');
  title.replaceChildren(document.createTextNode(category==='All'?'All drinks ':category+' '),el('span',{text:visible.length}));
  document.getElementById('products').replaceChildren(...visible.map((p,index)=>{
    const variants=p.variants.filter(v=>v.is_active);
    const available=p.is_active&&p.category_active&&variants.length>0;
    return el('article',{class:'product',style:`--i:${Math.min(index,7)}`},
      el('div',{class:'product-photo'},el('img',{src:imageURL(p.image_path),alt:'',loading:'lazy',width:240,height:300})),
      el('h3',{text:p.name}),el('div',{class:'product-details'},el('span',{text:variants.map(v=>v.label).join(' / ')})),
      el('div',{class:'product-bottom'},el('span',{class:'price'},document.createTextNode(available?money(variants[0].price_centavos):'Unavailable'),...(available&&variants.length>1?[el('small',{text:' / '+variants.slice(1).map(v=>money(v.price_centavos)).join(' / ')})]:[])),
        el('button',{class:'add-preview','aria-label':`Choose ${p.name}`,disabled:!available||!!pending,text:'+',onclick:()=>chooseSize(p)})));
  }));
}
function showMessage(text){
  const toast=document.getElementById('toast');toast.textContent=text;toast.classList.add('visible');
  clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('visible'),2500);
}
async function loadMenu(){
  const state=document.getElementById('menu-state');
  if(!products.length)state.textContent='Loading the menu…';
  try{
    const menu=await request('/v1/menu',{signal:AbortSignal.timeout(10000)});
    products=menu.products;categories=menu.categories;
    document.getElementById('counter-note').textContent='Unpaid · '+menu.settings.counter_note;
    const nav=document.querySelector('.categories');
    nav.replaceChildren(el('span',{class:'category-indicator','aria-hidden':true}),...['All',...categories.map(c=>c.name)].map(name=>el('button',{
      class:'category'+(name===currentCategory?' active':''),'data-category':name,'aria-pressed':name===currentCategory,
      text:name==='All'?'All drinks':name,onclick:()=>filterProducts(name)})));
    if(!['All',...categories.map(c=>c.name)].includes(currentCategory))currentCategory='All';
    state.replaceChildren();if(!products.length)state.textContent='The menu is empty. Please ask at the counter.';
    renderProducts(currentCategory);if(currentScreen==='menu')updateCategoryIndicator();
  }catch{
    state.replaceChildren(el('span',{text:products.length?'Café server unavailable—please try again later. The displayed menu may be out of date.':'Café server unavailable—please try again later or ask at the counter.'}),el('button',{text:'Retry',onclick:loadMenu}));
  }
}
function chooseSize(product){
  document.getElementById('size-title').textContent=product.name;
  const dialog=document.getElementById('size-dialog');
  document.getElementById('size-options').replaceChildren(...product.variants.filter(v=>v.is_active).map(v=>el('button',{
    class:'button size-choice',text:`${v.label} · ${money(v.price_centavos)}`,onclick:()=>{
      if(pending)return;const existing=cart.find(i=>i.variant_id===v.id);
      if(existing){if(existing.quantity>=99){showMessage('Maximum 99 of each drink.');return;}existing.quantity++;}
      else cart.push({variant_id:v.id,name:product.name,label:v.label,price_centavos:v.price_centavos,quantity:1});
      dialog.close();renderCart();showMessage('Added to your order');
    }})));
  dialog.showModal();
}
function renderCart(){
  const count=cart.reduce((s,i)=>s+i.quantity,0);const button=document.getElementById('open-cart');
  button.hidden=!count;button.textContent=`Review order (${count}) · ${money(cartTotal(cart))}`;
  document.getElementById('cart-type').textContent=pending?.body.order_type||selectedOrderType||'';
  document.getElementById('cart-items').replaceChildren(...cart.map(item=>el('div',{class:'cart-line'},
    el('div',{},el('strong',{text:item.name}),el('small',{text:`${item.label} · ${money(item.price_centavos)}`})),
    el('div',{class:'quantity-control'},
      el('button',{text:'−','aria-label':`Reduce ${item.name}`,disabled:!!pending||submitting,onclick:()=>changeQuantity(item,-1)}),
      el('span',{text:item.quantity}),el('button',{text:'+','aria-label':`Increase ${item.name}`,disabled:!!pending||submitting||item.quantity>=99,onclick:()=>changeQuantity(item,1)}),
      el('button',{text:'Remove',disabled:!!pending||submitting,onclick:()=>{cart=cart.filter(i=>i!==item);renderCart();}})))));
  document.getElementById('cart-total').textContent=`Estimated total · ${money(cartTotal(cart))}`;
  document.getElementById('submit-order').disabled=submitting||!cart.length;
  document.getElementById('submit-order').textContent=submitting?'Sending…':pending?'Retry same order':'Place unpaid order';
}
function changeQuantity(item,delta){item.quantity+=delta;if(item.quantity<=0)cart=cart.filter(i=>i!==item);renderCart();}
async function submitOrder(){
  if(submitting||!cart.length)return;
  const message=document.getElementById('cart-message');
  try{
    if(!pending){pending={key:crypto.randomUUID(),body:orderPayload(selectedOrderType,cart),cart:structuredClone(cart)};sessionStorage.setItem('ksl_pending',JSON.stringify(pending));}
    submitting=true;renderCart();renderProducts(currentCategory);message.textContent='Sending your unpaid order…';
    const result=await request('/v1/orders',{method:'POST',body:pending.body,key:pending.key,signal:AbortSignal.timeout(20000)});
    pending=null;sessionStorage.removeItem('ksl_pending');cart=[];
    document.getElementById('cart-dialog').close();
    document.getElementById('order-reference').textContent=result.reference;
    document.getElementById('order-confirmed-total').textContent=`Total · ${money(result.total_centavos)}`;
    document.getElementById('confirmation').showModal();message.textContent='';
  }catch(error){
    if(error.status&&error.status<500&&![408,429].includes(error.status)){pending=null;sessionStorage.removeItem('ksl_pending');message.textContent=error.message+' Review your cart before sending again.';await loadMenu();}
    else message.textContent='We could not confirm the result. Retry this same order; your submission key is saved to prevent duplicates.';
  }finally{submitting=false;renderCart();renderProducts(currentCategory);}
}
document.getElementById('open-cart').addEventListener('click',()=>{renderCart();document.getElementById('cart-dialog').showModal();});
document.getElementById('submit-order').addEventListener('click',submitOrder);
document.getElementById('new-order').addEventListener('click',()=>{document.getElementById('confirmation').close();selectedOrderType=null;document.getElementById('continue').disabled=true;document.querySelectorAll('[data-order]').forEach(b=>b.setAttribute('aria-pressed','false'));showScreen('welcome');loadMenu();});
document.getElementById('confirmation').addEventListener('cancel',event=>event.preventDefault());
function updateCategoryIndicator() {
  const activeButton = document.querySelector('.category.active');
  const indicator = document.querySelector('.category-indicator');
  if(!activeButton||!indicator)return;
  indicator.style.width = activeButton.offsetWidth + 'px';
  indicator.style.transform = `translateX(${activeButton.offsetLeft}px)`;
}

function filterProducts(category) {
  if (category === currentCategory) return;
  currentCategory = category;
  document.querySelectorAll('.category').forEach(button => {
    const isActive = button.dataset.category === category;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
  updateCategoryIndicator();
  renderProducts(category);
}

document.getElementById('start-order').addEventListener('click', () => showScreen('order-type'));
document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document.querySelectorAll('[data-order]').forEach(button => button.addEventListener('click', () => selectOrderType(button.dataset.order)));
document.getElementById('continue').addEventListener('click', continueToMenu);
window.addEventListener('resize', () => { if (currentScreen === 'menu') updateCategoryIndicator(); });
window.addEventListener('online',loadMenu);
renderCart();loadMenu();
setInterval(()=>{if(currentScreen==='menu'&&!document.hidden)loadMenu();},30000);
if(pending){selectedOrderType=pending.body.order_type;document.getElementById('cart-message').textContent='An order is awaiting confirmation. Retry the same order to avoid duplicates.';document.getElementById('cart-dialog').showModal();}

// Mouse movement tilts only the drink layers; touch scrolling stays native.
const coffeeStage = document.querySelector('.coffee-stage');
function resetCupTilt() {
  coffeeStage.style.setProperty('--tilt-x', '0deg');
  coffeeStage.style.setProperty('--tilt-y', '0deg');
}
coffeeStage.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
  const bounds = coffeeStage.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
  const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
  coffeeStage.style.setProperty('--tilt-x', `${-y * 6}deg`);
  coffeeStage.style.setProperty('--tilt-y', `${x * 9}deg`);
});
coffeeStage.addEventListener('pointerleave', resetCupTilt);
reducedMotion.addEventListener('change', resetCupTilt);
