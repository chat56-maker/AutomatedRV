import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Engine,readResponse,digest,viewerProtocol} from '../engine.mjs';
import {phasePlan} from '../viewer-flow.mjs';
import {config,accounts,stream,reply,until} from './fixtures.mjs';

test('SSE requires completion and preserves partial text on subscription failure',async()=>{
 assert.equal((await readResponse(stream('hola'))).text,'hola');
 await assert.rejects(()=>readResponse(stream('partial','response.failed')),e=>e.message==='subscription_sharing_usage_limit_exceeded'&&e.partialText==='partial');
 await assert.rejects(()=>readResponse(new Response('data: {"type":"response.output_text.delta","delta":"x"}\n\n')),/interrumpido/);
});
test('SSE accepts split UTF-8 and CRLF boundaries',async()=>{
 const data=new TextEncoder().encode(`data: ${JSON.stringify({type:'response.output_text.delta',delta:'Sensación fría'})}\r\n\r\ndata: {"type":"response.completed","response":{"status":"completed"}}\r\n\r\n`);
 const result=await readResponse(new Response(new ReadableStream({start(c){for(const byte of data)c.enqueue(new Uint8Array([byte]));c.close();}})));
 assert.equal(result.text,'Sensación fría');
});
test('parallel viewers complete the full flow with isolated prompts, sealed records and idempotency',async()=>{
 let active=0,maximum=0;const bodies=[],saved=[];
 const engine=new Engine({accounts,persist:async j=>saved.push(j),fetcher:async(_url,opts)=>{
  active++;maximum=Math.max(maximum,active);const b=JSON.parse(opts.body);bodies.push(b);
  assert.deepEqual(Object.keys(b).sort(),['model','input','store','stream','max_output_tokens'].sort());assert.equal(b.store,false);
  await new Promise(r=>setTimeout(r,2));active--;return stream(reply(JSON.parse(b.input[1].content[0].text)));
 }});
 const id=randomUUID();await Promise.all(Array.from({length:5},()=>engine.start({id,code:'SECRET_CODE',config:{...config,instructions:'SECRET_HINT',categories:['SECRET_CATEGORY']},privateTarget:'SECRET_TARGET',feedback:'SECRET_FEEDBACK',images:['SECRET_IMAGE'],history:['SECRET_HISTORY']})));
 await until(()=>!engine.controllers.size);const job=engine.jobs.get(id);
 assert.equal(job.status,'sealed',job.error);assert.equal(job.viewerProtocol,viewerProtocol);assert.equal(bodies.length,20);assert.equal(maximum,2);assert.equal(job.resultHash,digest(job.sessions));
 assert.doesNotMatch(JSON.stringify(bodies),/SECRET_|WITHHELD_ASSOCIATION/);
 for(const s of job.sessions){assert.deepEqual(s.phases.map(p=>p.phase),phasePlan(config));assert.ok(s.phases.at(-1).data.composition);
  for(const p of s.phases){const {hash,...record}=p;assert.equal(hash,digest(record));assert.equal(p.promptHash,digest(p.prompt));assert.ok(bodies.some(b=>JSON.stringify(b.input)===JSON.stringify(p.prompt)));
   const d=JSON.parse(p.prompt[1].content[0].text);assert.equal(d.targetCode,job.viewerCode);
   if(p.phase==='opening')assert.deepEqual(d.ownSealedPhases,[]);
   for(const old of d.ownSealedPhases)for(const c of old.data.impressions)assert.ok(c.id.startsWith(s.id+'-'));
  }
 }
 for(const early of saved)for(const s of early.sessions)for(let i=0;i<s.phases.length;i++)assert.deepEqual(s.phases[i],job.sessions.find(x=>x.id===s.id).phases[i]);
 await engine.start({id,code:'OTHER',config});assert.equal(bodies.length,20);
});
test('malformed output retains the complete input and partial response without retry',async()=>{
 let calls=0;const e=new Engine({accounts,persist:async()=>{},fetcher:async()=>{calls++;return stream('not JSON');}}),id=randomUUID();
 await e.start({id,code:'BAD',config:{...config,agents:1}});await until(()=>!e.controllers.size);
 const s=e.jobs.get(id).sessions[0];assert.equal(calls,1);assert.equal(s.status,'error');assert.equal(s.phases.length,0);assert.equal(s.failures[0].raw,'not JSON');assert.equal(s.failures[0].promptHash,digest(s.failures[0].prompt));
});
test('cancellation stops queued viewers and does not dispatch another phase',async()=>{
 let calls=0;const e=new Engine({accounts,persist:async()=>{},fetcher:async(_u,opts)=>{calls++;return new Promise((_resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));}}),id=randomUUID();
 await e.start({id,code:'CANCEL',config});await until(()=>calls===2);await e.cancel(id);await until(()=>!e.controllers.size);
 assert.equal(e.jobs.get(id).status,'cancelled');assert.equal(calls,2);assert.ok(e.jobs.get(id).sessions.every(s=>s.status==='cancelled'));
});
test('empty opening still gets the planned exploration; all-empty viewers skip synthesis and judges',async()=>{
 let calls=0;const e=new Engine({accounts,persist:async()=>{},fetcher:async(_u,o)=>{calls++;return stream(reply(JSON.parse(JSON.parse(o.body).input[1].content[0].text),true));}}),id=randomUUID();
 await e.start({id,code:'EMPTY',config});await until(()=>!e.controllers.size);const j=e.jobs.get(id);
 assert.equal(calls,12);assert.equal(j.status,'sealed');for(const s of j.sessions){assert.equal(s.status,'abstained');assert.deepEqual(s.phases.map(p=>p.phase),['opening','capture','capture2']);}
 await assert.rejects(()=>e.evaluate({id}),/No hay impresiones/);assert.equal(calls,12);
});
test('a nonempty opening survives empty exploration and supplies the composition',async()=>{
 const e=new Engine({accounts,persist:async()=>{},fetcher:async(_u,o)=>{const d=JSON.parse(JSON.parse(o.body).input[1].content[0].text);return stream(reply(d,d.phase.startsWith('capture')));}}),id=randomUUID();
 await e.start({id,code:'FIRST',config:{...config,agents:1}});await until(()=>!e.controllers.size);
 const s=e.jobs.get(id).sessions[0];assert.equal(s.status,'completed');assert.equal(s.phases[0].data.impressions.length,2);assert.ok(s.phases.at(-1).data.composition.overview);
});
test('continuing without impressions remains an explicit option and never fabricates synthesis',async()=>{
 const e=new Engine({accounts,persist:async()=>{},fetcher:async(_u,o)=>stream(reply(JSON.parse(JSON.parse(o.body).input[1].content[0].text),true))}),id=randomUUID();
 await e.start({id,code:'EMPTY',config:{...config,agents:1,stopOnEmpty:false}});await until(()=>!e.controllers.size);
 const s=e.jobs.get(id).sessions[0];assert.equal(s.status,'completed');assert.equal(s.phases.length,5);assert.equal(s.phases.at(-1).data.composition.overview,null);
});
test('exploration-only mode and number of passes control actual calls',async()=>{
 for(const capturePasses of [1,2,3]){let calls=0;const e=new Engine({accounts,persist:async()=>{},fetcher:async(_u,o)=>{calls++;return stream(reply(JSON.parse(JSON.parse(o.body).input[1].content[0].text)));}}),id=randomUUID();
  await e.start({id,code:'PASS',config:{...config,agents:1,phases:'capture',capturePasses}});await until(()=>!e.controllers.size);assert.equal(calls,1+capturePasses);assert.equal(e.jobs.get(id).status,'sealed');
 }
});
test('feedback images reach judges only after closure, without altering viewers or the next run',async()=>{
 const bodies=[];const e=new Engine({accounts,persist:async()=>{},fetcher:async(_u,o)=>{const b=JSON.parse(o.body),d=JSON.parse(b.input[1].content[0].text);bodies.push(b);return stream(d.claims?JSON.stringify({assessments:d.claims.map(c=>({claimId:c.id,verdict:'unverifiable',reason:'Test',evidence:''})),summary:'Test'}):reply(d));}}),id=randomUUID();
 await e.start({id,code:'FIRST',config:{...config,agents:1}});await assert.rejects(()=>e.evaluate({id}),/Primero cierra/);await until(()=>!e.controllers.size);
 const job=e.jobs.get(id),sealed=JSON.stringify(job.sessions),before=bodies.length,image='data:image/png;base64,VEVTVA==';
 const p={id,evidence:'SECRET_FEEDBACK',images:[image],judgeModel:'model-b',judges:2,evidenceHash:digest('e'),evidenceVersion:digest('v')};
 await Promise.all([e.evaluate(p),e.evaluate(p)]);await until(()=>!e.controllers.size);assert.equal(job.evaluation.status,'completed');assert.equal(job.evaluation.judges.length,2);
 assert.doesNotMatch(JSON.stringify(bodies.slice(0,before)),/SECRET_FEEDBACK|input_image/);for(const b of bodies.slice(before))assert.equal(b.input[1].content[1].image_url,image);
 assert.equal(JSON.stringify(job.sessions),sealed);const count=bodies.length;await e.evaluate(p);assert.equal(count,bodies.length);
 const next=randomUUID();await e.start({id:next,code:'SECOND',config:{...config,agents:1,phases:'capture'}});await until(()=>!e.controllers.size);
 assert.doesNotMatch(JSON.stringify(bodies.slice(count)),/SECRET_FEEDBACK|input_image/);assert.notEqual(e.jobs.get(next).viewerCode,job.viewerCode);assert.deepEqual(JSON.parse(bodies[count].input[1].content[0].text).ownSealedPhases,[]);
});
test('repeated perceptions remain in records but are evaluated once; composition is not another claim',async()=>{
 const judged=[];const e=new Engine({accounts,persist:async()=>{},fetcher:async(_u,o)=>{const d=JSON.parse(JSON.parse(o.body).input[1].content[0].text);
  if(d.claims){judged.push(...d.claims);return stream(JSON.stringify({assessments:[],summary:'Test'}));}
  if(d.phase.startsWith('capture'))return stream(JSON.stringify({impressions:[{text:'Fragmento libre A.',category:null,basedOn:[]}],associations:[],abstention:null}));
  return stream(reply(d));
 }}),id=randomUUID();await e.start({id,code:'REPEAT',config:{...config,agents:1}});await until(()=>!e.controllers.size);
 const s=e.jobs.get(id).sessions[0];assert.equal(s.phases.flatMap(p=>p.data.impressions).length,4);assert.equal(s.phases[1].data.impressions[0].duplicateOf,'v01-opening-1');
 await e.evaluate({id,evidence:'Evidence',judgeModel:'model-b',judges:1,evidenceHash:digest('r'),evidenceVersion:digest('v')});await until(()=>!e.controllers.size);
 assert.equal(judged.length,2);assert.deepEqual(judged.map(c=>c.id),['v01-opening-1','v01-opening-2']);
});
