import {element as el,money} from '../shared/api.js';
export {el,money};
export const badge=value=>el('span',{class:`badge ${value}`,text:value.replaceAll('_',' ')});
export function table(headings,rows){return el('div',{class:'table-wrap'},el('table',{},el('thead',{},el('tr',{},...headings.map(text=>el('th',{scope:'col',text})))),el('tbody',{},...rows.map(row=>el('tr',{},...row.map(cell=>el('td',{},cell)))))));}
export const empty=text=>el('p',{class:'empty',text});
export function panel(title,...children){return el('section',{class:'panel'},el('div',{class:'panel-heading'},el('h2',{text:title})),...children);}
export function input(label,name,value='',options={}){
  const node=el(options.multiline?'textarea':'input',{name,value:options.multiline?undefined:value,...options});
  if(options.multiline)node.value=value;
  return el('label',{class:options.wide?'wide':''},document.createTextNode(label),node);
}
export function select(label,name,value,choices){const node=el('select',{name},...choices.map(([v,t])=>el('option',{value:v,text:t})));node.value=String(value);return el('label',{},document.createTextNode(label),node);}
export function checkbox(label,name,checked){return el('label',{},el('input',{type:'checkbox',name,checked}),document.createTextNode(label));}
export function editor(title,form){document.getElementById('editor-content').replaceChildren(el('h2',{text:title}),form);document.getElementById('editor').showModal();}
export function submitForm(form,label,work,ctx){
  const button=el('button',{class:'primary',type:'submit',text:label});const error=el('p',{role:'alert'});form.append(error,el('div',{class:'form-actions'},button));
  form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;error.textContent='';try{await work(new FormData(form));document.getElementById('editor').close();await ctx.refresh();}catch(e){error.textContent=e.message;}finally{button.disabled=false;}});return form;
}
