import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {get} from 'node:http';
test('loopback bridge rejects foreign Host, Origin and missing session token',async()=>{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 await mkdir('test/.tmp',{recursive:true});const dir=await mkdtemp('test/.tmp/http-');
 const child=spawn(process.execPath,['server.mjs','--port',String(port),'--data',resolve(dir),'--site','https://limen-rv.zeros.chatgpt.site'],{stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Connector did not start')),5000);child.stdout.once('data',()=>{clearTimeout(t);resolve();});child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error(`exit ${code}`));});});
  const local=`http://127.0.0.1:${port}`,page=await fetch(local),html=await page.text();assert.equal(page.status,200);assert.equal(page.headers.get('x-frame-options'),'DENY');assert.ok(html.includes('CONECTOR LOCAL · 1.0.1'));
  const token=html.match(/data-token="([^"]+)"/)[1];
  const rpc=(origin,sessionToken)=>fetch(`${local}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Limen-Token':sessionToken},body:JSON.stringify({method:'status'})});
  assert.equal((await rpc('https://evil.invalid',token)).status,403);assert.equal((await rpc(local,'incorrect')).status,403);
  const valid=await rpc(local,token);assert.equal(valid.status,200);const data=await valid.json();assert.equal(data.result.version,'1.0.1');assert.equal(data.result.selected,null);assert.deepEqual(data.result.accounts,[]);assert.ok(!JSON.stringify(data).includes('refresh_token'));
  const badStatus=await new Promise((resolve,reject)=>{get(local,{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(badStatus,403);
  assert.equal((await fetch(`${local}/auth/callback?state=wrong`)).status,400);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await rm(dir,{recursive:true,force:true});}
});
