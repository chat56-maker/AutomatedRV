import http from 'node:http';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Accounts,atomic,random} from './oauth.mjs';
import {Engine} from './engine.mjs';

const args=process.argv.slice(2), option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const site=new URL(option('--site','https://limen-rv.zeros.chatgpt.site')).origin;
if(!site.startsWith('https://'))throw new Error('--site debe ser un origen HTTPS.');
const port=Number(option('--port','1455'));
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Puerto inválido.');
const local=`http://127.0.0.1:${port}`, token=random();
const dir=option('--data',process.env.LIMEN_DATA_DIR||join(homedir(),'.config','limen-rv'));
const root=dirname(fileURLToPath(import.meta.url));
const {version}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const accounts=await new Accounts(dir,`${local}/auth/callback`).init();
const jobsDir=join(dir,'jobs');await mkdir(jobsDir,{recursive:true,mode:0o700});
const loadJobs=[];
for(const f of await readdir(jobsDir))if(/^[0-9a-f-]{36}\.json$/.test(f)){
  const j=JSON.parse(await readFile(join(jobsDir,f),'utf8'));
  if(j.status==='running'){j.status='partial';j.error='El conector se reinició. Los registros completos se conservan; no se reintentó la inferencia.';j.sessions.forEach(s=>{if(['running','queued'].includes(s.status)){s.status='error';s.error='Ejecución interrumpida por reinicio.';}});j.revision++;j.sealedAt=new Date().toISOString();delete j.resultHash;await atomic(join(jobsDir,f),j);}
  if(j.evaluation?.status==='running'){j.evaluation.status='partial';j.evaluation.error='Evaluación interrumpida por reinicio.';j.revision++;await atomic(join(jobsDir,f),j);}
  loadJobs.push(j);
}
const engine=new Engine({accounts,loadJobs,persist:j=>atomic(join(jobsDir,`${j.id}.json`),j)});
const escape=s=>s.replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const status=()=>({version,site,...accounts.list(),jobs:[...engine.jobs.values()].map(j=>({id:j.id,code:j.code,status:j.status,updatedAt:j.updatedAt}))});
const page=(title,content)=>`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Limen</title><style>body{background:#f4f3ee;color:#20251f;font:16px system-ui;max-width:560px;margin:10vh auto;padding:28px}h1{font-size:34px;letter-spacing:-1px}p{line-height:1.6;color:#62655d}button{background:#243b2b;color:white;border:0;padding:14px 20px;border-radius:8px;font:inherit;cursor:pointer;margin:6px 6px 6px 0}button.secondary{background:#e4e7df;color:#243b2b}small{display:block;line-height:1.6;color:#73776c}code{overflow-wrap:anywhere}select{padding:10px;width:100%;margin:12px 0}#message{white-space:pre-wrap}.dot{color:#67864b}</style><body><b class="dot">◉ LIMEN / CONECTOR LOCAL · ${version}</b><h1>${title}</h1>${content}</body></html>`;
const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
  const send=(code,body,type='application/json')=>{res.writeHead(code,{...headers,'Content-Type':`${type}; charset=utf-8`});res.end(type==='application/json'?JSON.stringify(body):body);};
  try{
    if(req.headers.host!==`127.0.0.1:${port}`)return send(403,{error:'Host no autorizado.'});
    const url=new URL(req.url,local);
    if(req.method==='GET'&&url.pathname==='/')return send(200,page('Tu plan, tu laboratorio.',`<p>Este conector ejecuta los agentes en tu equipo y guarda aquí las credenciales de ChatGPT. Mantén esta ventana abierta mientras usas el laboratorio.</p><small>Site autorizado: <code>${escape(site)}</code></small><select id="accounts" aria-label="Cuenta de ChatGPT"></select><button id="connect">Continuar con ChatGPT</button><button id="disconnect" class="secondary">Desconectar cuenta</button><p id="message" role="status">Cargando conexión…</p><small>Las ejecuciones consumen los límites disponibles de tu plan. Una suscripción activa y los permisos del modelo son necesarios. Puedes revocar el acceso en ChatGPT.</small><div id="bridge-config" data-site="${escape(site)}" data-token="${token}"></div><script src="/bridge.js"></script>`),'text/html');
    if(req.method==='GET'&&url.pathname==='/bridge.js')return send(200,await readFile(join(root,'bridge.js'),'utf8'),'text/javascript');
    if(req.method==='GET'&&url.pathname==='/auth/callback'){
      try{await accounts.callback(url.searchParams);return send(200,page('Cuenta conectada.',`<p>Puedes cerrar esta pestaña y volver a la ventana del conector. El laboratorio detectará la conexión automáticamente.</p><small>No cierres el proceso del conector en la terminal.</small>`),'text/html');}
      catch(e){return send(400,page('No se completó la conexión.',`<p>${escape(e.message)}</p><p>Vuelve a la ventana del conector e inténtalo de nuevo.</p>`),'text/html');}
    }
    if(req.method!=='POST'||url.pathname!=='/rpc')return send(404,{error:'Ruta no encontrada.'});
    if(req.headers.origin!==local||req.headers['x-limen-token']!==token)return send(403,{error:'Origen o sesión no autorizados.'});
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>72*1024*1024){send(413,{error:'La solicitud supera el límite.'});return;}chunks.push(chunk);}
    const raw=Buffer.concat(chunks).toString('utf8');
    const {method,payload={}}=JSON.parse(raw);let result;
    switch(method){
      case 'status': result=status();break;
      case 'models': result=await accounts.models();break;
      case 'auth': result=accounts.begin(payload.id);break;
      case 'select': if(engine.controllers.size)throw new Error('Espera a que terminen las ejecuciones antes de cambiar de cuenta.');result=await accounts.select(payload.id);break;
      case 'logout': if(engine.controllers.size)throw new Error('Detén las ejecuciones antes de desconectar la cuenta.');result=await accounts.logout(payload.id);break;
      case 'start': result=await engine.start(payload);break;
      case 'job': result=engine.jobs.get(payload.id);if(!result)throw new Error('Sesión no encontrada en este conector.');break;
      case 'cancel': result=await engine.cancel(payload.id);engine.controllers.get(`${payload.id}:evaluation`)?.abort();break;
      case 'evaluate': result=await engine.evaluate(payload);break;
      default: throw new Error('Método no permitido.');
    }
    return send(200,{result});
  }catch(e){return send(400,{error:String(e.message||'Error del conector').slice(0,500)});}
});
server.headersTimeout=15000;server.requestTimeout=120000;
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`El puerto ${port} ya está ocupado. Cierra el otro conector o usa --port.`:e.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Limen ${version} está listo.\nSite autorizado: ${site}\nConector: ${local}\nAbre «Conectar» en el Site y mantén esta terminal abierta.\nLas credenciales permanecen en tu equipo.`));
process.on('SIGINT',()=>{for(const c of engine.controllers.values())c.abort();server.close();setTimeout(()=>process.exit(0),1500).unref();});
