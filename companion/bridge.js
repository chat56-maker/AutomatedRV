/* Browser-side transport. OAuth tokens never enter this page. */
const config=document.getElementById('bridge-config');
const site=config.dataset.site,token=config.dataset.token;
const channel=new URL(location.href).searchParams.get('channel');
const label=document.getElementById('message'),select=document.getElementById('accounts');
const rpc=async(method,payload={})=>{const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Limen-Token':token},body:JSON.stringify({method,payload})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Error del conector');return d.result;};
const allowed=new Set(['status','models','start','job','cancel','evaluate']);
window.addEventListener('message',async event=>{
  if(event.origin!==site||event.source!==window.opener||event.data?.channel!==channel||event.data?.type!=='limen:request')return;
  const {id,method,payload}=event.data;
  if(typeof id!=='string'||!allowed.has(method))return;
  try{const result=await rpc(method,payload);event.source.postMessage({type:'limen:response',channel,id,result},site);}
  catch(e){event.source.postMessage({type:'limen:response',channel,id,error:e.message},site);}
});
let previous='';
async function refresh(){try{const state=await rpc('status');const encoded=JSON.stringify([state.accounts,state.selected]);if(encoded!==previous){select.replaceChildren(...[new Option('Añadir otra cuenta',''),...state.accounts.map(a=>new Option(`${a.label}${a.connected?'':' · desconectada'}`,a.id))]);select.value=state.selected||'';previous=encoded;}
  label.textContent=state.selected?'Conectado. Vuelve al laboratorio para elegir modelos e iniciar una sesión.':'Conecta ChatGPT para usar los límites de tu plan.';
  if(window.opener&&channel)window.opener.postMessage({type:'limen:ready',channel,status:state},site);
}catch(e){label.textContent=e.message;}}
document.getElementById('connect').onclick=async()=>{const popup=window.open('about:blank','limen-oauth','width=650,height=800');if(!popup){label.textContent='Permite ventanas emergentes para conectar ChatGPT.';return;}try{const data=await rpc('auth',{id:select.value||undefined});popup.location.href=data.url;}catch(e){popup.close();label.textContent=e.message;}};
select.onchange=async()=>{if(!select.value)return;try{await rpc('select',{id:select.value});await refresh();}catch(e){label.textContent=e.message;}};
document.getElementById('disconnect').onclick=async()=>{if(!select.value)return;try{const result=await rpc('logout',{id:select.value});await refresh();label.textContent=result.message;}catch(e){label.textContent=e.message;}};
refresh();setInterval(refresh,5000);
