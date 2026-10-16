import {imageURL} from '../shared/api.js';
import {el,money,badge,table,empty,panel,input,select,checkbox,editor,submitForm} from './ui.js';
export async function productsView(ctx){
  const catalog=await ctx.api('/v1/admin/catalog');
  const search=el('input',{type:'search',placeholder:'Search products','aria-label':'Search products'});
  const filter=el('select',{'aria-label':'Filter availability'},el('option',{value:'all',text:'All availability'}),el('option',{value:'active',text:'Available'}),el('option',{value:'inactive',text:'Unavailable'}));
  const category=el('select',{'aria-label':'Filter category'},el('option',{value:'all',text:'All categories'}),...catalog.categories.map(c=>el('option',{value:c.id,text:c.name})));
  const list=el('div');
  function render(){
    const items=catalog.products.filter(p=>{
      const active=p.is_active&&p.category_active&&p.variants.some(v=>v.is_active);
      return p.name.toLowerCase().includes(search.value.toLowerCase())&&(category.value==='all'||p.category_id===category.value)&&(filter.value==='all'||(filter.value==='active')===active);
    });
    list.replaceChildren(items.length?table(['Product','Category','Sizes / prices','Availability','Actions'],items.map(p=>[
      el('div',{},el('img',{class:'thumb',src:imageURL(p.image_path),alt:''}),document.createTextNode(p.name)),p.category,
      el('div',{},...p.variants.filter(v=>v.is_active).map(v=>el('small',{text:`${v.label} · ${money(v.price_centavos)}`}))),badge(p.is_active&&p.category_active&&p.variants.some(v=>v.is_active)?'available':'unavailable'),
      el('div',{},el('button',{text:'Edit',onclick:()=>editProduct(ctx,catalog,p)}),el('button',{text:'Archive',class:'danger',onclick:async()=>{if(confirm(`Archive ${p.name}? Historical orders stay unchanged.`)){try{await ctx.api(`/v1/admin/products/${p.id}/archive`,{method:'POST'});ctx.refresh();}catch(e){ctx.notice(e.message);}}}}))
    ])):empty('No matching products.'));
  }
  for(const node of [search,filter,category])node.addEventListener('input',render);render();
  return panel('Your menu',el('div',{class:'toolbar'},search,category,filter,el('button',{class:'primary',text:'Add product',onclick:()=>editProduct(ctx,catalog)})),list);
}
function editProduct(ctx,catalog,p){
  const form=el('form');const fields=el('div',{class:'form-grid'},input('Product name','name',p?.name||'',{required:true,maxlength:120}),select('Category','category_id',p?.category_id||catalog.categories[0]?.id,catalog.categories.map(c=>[c.id,c.name])),input('Description','description',p?.description||'',{multiline:true,wide:true,maxlength:2000}),input('Menu position','sort_order',p?.sort_order||0,{type:'number',min:0,max:10000,required:true}),checkbox('Available','is_active',p?p.is_active:true));
  form.append(fields,el('h3',{text:'Sizes and prices'}),el('p',{class:'muted',text:'Enable the sizes shown on the menu.'}));
  for(const size of catalog.sizes){const v=p?.variants.find(v=>v.size_id===size.id);form.append(el('div',{class:'variant-row'},el('strong',{text:size.label}),input('Price (₱)',`price_${size.id}`,v?(v.price_centavos/100).toFixed(2):'0.00',{type:'number',min:0,max:100000,step:'0.01',required:true}),checkbox('Enabled',`active_${size.id}`,p?!!v?.is_active:true)));}
  const preview=el('img',{class:'image-preview',src:imageURL(p?.image_path),alt:'Product image preview'});
  const file=el('input',{type:'file',name:'image',accept:'image/png,image/jpeg,image/webp','aria-label':'Product image'});
  let previewURL;file.addEventListener('change',()=>{if(previewURL)URL.revokeObjectURL(previewURL);if(file.files[0]){previewURL=URL.createObjectURL(file.files[0]);preview.src=previewURL;}});
  form.append(el('h3',{text:'Product image'}),preview,file,el('small',{text:'PNG, JPEG or WebP · up to 5 MB. Images are stored on the café server.'}));
  editor(p?'Edit product':'Add product',submitForm(form,'Save product',async data=>{
    const variants=catalog.sizes.map(size=>({size_id:size.id,price_centavos:Math.round(Number(data.get(`price_${size.id}`))*100),is_active:data.has(`active_${size.id}`)}));
    const body={name:data.get('name'),category_id:data.get('category_id'),description:data.get('description'),sort_order:Number(data.get('sort_order')),is_active:data.has('is_active'),variants};
    const saved=await ctx.api('/v1/admin/products'+(p?'/'+p.id:''),{method:p?'PUT':'POST',body});
    // Retain the saved id if upload fails so retry never creates another product.
    p=saved;
    if(file.files[0]){const upload=new FormData();upload.append('image',file.files[0]);await ctx.api(`/v1/admin/products/${saved.id}/image`,{method:'POST',body:upload});}
    if(previewURL)URL.revokeObjectURL(previewURL);
  },ctx));
}
export async function categoriesView(ctx){
  const {categories}=await ctx.api('/v1/admin/catalog');
  function edit(c){const form=el('form',{},input('Category name','name',c?.name||'',{required:true,maxlength:120}),input('Display position','sort_order',c?.sort_order||0,{type:'number',min:0,max:10000,required:true}),checkbox('Enabled','is_active',c?c.is_active:true));editor(c?'Edit category':'Add category',submitForm(form,'Save category',async data=>ctx.api('/v1/admin/categories'+(c?'/'+c.id:''),{method:c?'PUT':'POST',body:{name:data.get('name'),sort_order:Number(data.get('sort_order')),is_active:data.has('is_active')}}),ctx));}
  return panel('Menu categories',el('div',{class:'toolbar'},el('p',{class:'muted',text:'Positions set the display order. Disabling a category hides its products.'}),el('button',{class:'primary',text:'Add category',onclick:()=>edit()})),categories.length?table(['Name','Position','Status',''],categories.map(c=>[c.name,String(c.sort_order),badge(c.is_active?'available':'unavailable'),el('button',{text:'Edit',onclick:()=>edit(c)})])):empty('No categories yet.'));
}
