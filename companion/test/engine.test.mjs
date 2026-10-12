import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Engine,readResponse,digest,viewerProtocol,capturePrompt} from '../engine.mjs';
const config={models:['model-a','model-b'],agents:4,concurrency:2,phases:'structured',reasoning:'default',maxTokens:1000,timeout:30,categories:['Presión','Otra'],instructions:'Protocolo de prueba.',judgeModel:'model-b',judges:2};
const accounts={selected:()=>({id:'test-account'}),access:async()=> 'test-token',models:async()=>[{id:'model-a'},{id:'model-b'}]};
const capture=JSON.stringify({impressions:[{category:'Presión',text:'Presión leve hacia arriba.',intensity:.4}],relations:[],hypotheses:[],abstention:null});
const reply=data=>data.phase==='capture'?capture:JSON.stringify({impressions:[],relations:data.phase==='structure'&&data.ownSealedPhases[0]?.data.impressions.length?['Relación tentativa con '+data.ownSealedPhases[0].data.impressions[0].id]:[],hypotheses:data.phase==='interpret'&&data.ownSealedPhases[0]?.data.impressions.length?[{text:'Hipótesis tentativa.',basedOn:[data.ownSealedPhases[0].data.impressions[0].id]}]:[],abstention:null});
const stream=(text,final='response.completed')=>new Response(`data: ${JSON.stringify({type:'response.output_text.delta',delta:text})}\n\ndata: ${JSON.stringify({type:final,response:{id:'test-response',status:final==='response.completed'?'completed':'failed',usage:{total_tokens:37},error:final==='response.completed'?null:{message:'subscription_sharing_usage_limit_exceeded'}}})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
async function until(fn){const deadline=Date.now()+3000;while(!fn()){if(Date.now()>deadline)throw new Error('Timed out');await new Promise(r=>setTimeout(r,5));}}
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
test('parallel execution enforces isolation, concurrency, immutable stages and idempotency',async()=>{
 let active=0,maximum=0,calls=0;const inputs=[],saved=[];
 const engine=new Engine({accounts,persist:async j=>saved.push(j),fetcher:async(_url,opts)=>{active++;maximum=Math.max(maximum,active);calls++;const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.tools,undefined);inputs.push(body);await new Promise(r=>setTimeout(r,4));active--;return stream(reply(JSON.parse(body.input[1].content[0].text)));}});
 const id=randomUUID();await Promise.all(Array.from({length:5},()=>engine.start({id,code:'TARGET-123',config,privateTarget:'THIS MUST NEVER ENTER PROMPTS'})));
 await until(()=>engine.jobs.get(id).status!=='running');const job=engine.jobs.get(id);
 assert.equal(job.status,'sealed');assert.equal(job.viewerProtocol,viewerProtocol);assert.equal(calls,12);assert.equal(maximum,2);assert.equal(job.resultHash,digest(job.sessions));
 for(const input of inputs){assert.ok(!JSON.stringify(input).includes('THIS MUST'));const user=JSON.parse(input.input[1].content[0].text);assert.equal(user.targetCode,job.viewerCode);assert.notEqual(user.targetCode,job.code);assert.deepEqual(Object.keys(user).sort(),['targetCode','phase','ownSealedPhases'].sort());if(user.phase==='capture')assert.deepEqual(user.ownSealedPhases,[]);else{const ids=user.ownSealedPhases.flatMap(p=>p.data.impressions.map(c=>c.id.split('-')[0]));assert.equal(new Set(ids).size,1);}}
 for(const s of job.sessions){assert.equal(s.phases.length,3);for(const p of s.phases){const {hash,...raw}=p;assert.equal(hash,digest(raw));assert.match(p.promptHash,/^[0-9a-f]{64}$/);}}
 for(const earlier of saved){for(const s of earlier.sessions)for(let i=0;i<s.phases.length;i++)assert.deepEqual(s.phases[i],job.sessions.find(x=>x.id===s.id).phases[i]);}
 await engine.start({id,code:'TARGET-123',config});assert.equal(calls,12);
});
test('malformed or failed output is retained and not retried',async()=>{
 let calls=0;const engine=new Engine({accounts,persist:async()=>{},fetcher:async()=>{calls++;return stream('not JSON');}});
 const id=randomUUID();await engine.start({id,code:'BAD',config:{...config,agents:1}});await until(()=>engine.jobs.get(id).status!=='running');
 const job=engine.jobs.get(id);assert.equal(job.status,'partial');assert.equal(calls,1);assert.equal(job.sessions[0].failures[0].raw,'not JSON');assert.equal(job.sessions[0].phases.length,0);
});
test('cancellation closes queued agents without issuing extra calls',async()=>{
 let calls=0;const engine=new Engine({accounts,persist:async()=>{},fetcher:async(_u,opts)=>{calls++;return new Promise((_resolve,reject)=>{if(opts.signal.aborted)reject(new Error('aborted'));else opts.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});}});
 const id=randomUUID();await engine.start({id,code:'CANCEL',config});await until(()=>calls===2);await engine.cancel(id);await until(()=>engine.jobs.get(id).status!=='running');
 assert.equal(engine.jobs.get(id).status,'cancelled');assert.equal(calls,2);assert.ok(engine.jobs.get(id).sessions.every(s=>s.status==='cancelled'));
});
test('evaluation starts after sealing, uses separate judges and is versioned',async()=>{
 const engine=new Engine({accounts,persist:async()=>{},fetcher:async(_u,opts)=>{const body=JSON.parse(opts.body),data=JSON.parse(body.input[1].content[0].text);if(!data.claims)return stream(reply(data));assert.equal(data.evidence,'Reference material');return stream(JSON.stringify({assessments:data.claims.map(c=>({claimId:c.id,verdict:'unverifiable',reason:'No verification.',evidence:''})),summary:'Limited evidence.'}));}});
 const id=randomUUID();await engine.start({id,code:'JUDGE',config:{...config,agents:1,phases:'capture'}});await until(()=>engine.jobs.get(id).status!=='running'&&!engine.controllers.size);
 const payload={id,evidence:'Reference material',judgeModel:'model-b',judges:2,evidenceHash:digest('reference'),evidenceVersion:digest('version')};
 await Promise.all([engine.evaluate(payload),engine.evaluate(payload)]);await until(()=>engine.jobs.get(id).evaluation.status!=='running');
 const evaluation=engine.jobs.get(id).evaluation;assert.equal(evaluation.judges.length,2);assert.ok(evaluation.judges.every(j=>j.status==='completed'));assert.equal(evaluation.evidenceVersion,payload.evidenceVersion);
 const again=await engine.evaluate(payload);assert.equal(again.createdAt,evaluation.createdAt);
});

const empty=JSON.stringify({impressions:[],relations:[],hypotheses:[],abstention:'No propongo candidatos.'});
test('empty captures end each viewer, preserve abstentions and consume no later calls or judges',async()=>{
 let calls=0;const saved=[];
 const engine=new Engine({accounts,persist:async j=>saved.push(j),fetcher:async()=>{calls++;return stream(empty);}});
 const id=randomUUID();await engine.start({id,code:'EMPTY',config});
 await until(()=>engine.jobs.get(id).status!=='running'&&!engine.controllers.size);
 const job=engine.jobs.get(id);
 assert.equal(calls,config.agents);assert.equal(job.status,'sealed');assert.equal(job.resultHash,digest(job.sessions));
 for(const s of job.sessions){assert.equal(s.status,'abstained');assert.equal(s.phases.length,1);assert.equal(s.phases[0].raw,empty);assert.equal(s.phases[0].data.impressions.length,0);assert.equal(s.phases[0].data.abstention,'No propongo candidatos.');}
 await assert.rejects(()=>engine.evaluate({id}),/No hay impresiones/);assert.equal(calls,config.agents);assert.equal(job.evaluation,undefined);
 assert.ok(saved.some(j=>j.status==='running'&&j.sessions.some(s=>s.status==='abstained')));
});
test('continuation after empty capture is opt-in and only receives own empty record',async()=>{
 let calls=0;
 const engine=new Engine({accounts,persist:async()=>{},fetcher:async(_url,opts)=>{calls++;const data=JSON.parse(JSON.parse(opts.body).input[1].content[0].text);if(data.phase==='capture')return stream(empty);assert.equal(data.ownSealedPhases[0].data.impressions.length,0);return stream(reply(data));}});
 const id=randomUUID();await engine.start({id,code:'CONTINUE',config:{...config,agents:1,stopOnEmpty:false}});await until(()=>engine.jobs.get(id).status!=='running');
 const job=engine.jobs.get(id);assert.equal(calls,3);assert.equal(job.sessions[0].status,'completed');assert.equal(job.sessions[0].phases[0].raw,empty);assert.equal(job.sessions[0].phases[1].data.impressions.length,0);
});
test('out-of-phase output is preserved as a failure and never retried or promoted to observations',async()=>{
 let calls=0;const text=JSON.stringify({impressions:[],relations:['Relación tentativa.'],hypotheses:[],abstention:null});
 const engine=new Engine({accounts,persist:async()=>{},fetcher:async()=>{calls++;return stream(text);}});
 const id=randomUUID();await engine.start({id,code:'RELATION',config:{...config,agents:1,stopOnEmpty:true}});await until(()=>engine.jobs.get(id).status!=='running');
 assert.equal(calls,1);assert.equal(engine.jobs.get(id).sessions[0].status,'error');assert.equal(engine.jobs.get(id).sessions[0].failures[0].raw,text);
});

test('neutral prompts exclude saved hints, future tasks and unexpected prior metadata',()=>{
 const poisoned={...config,categories:['SECRET_CATEGORY_CATHEDRAL'],instructions:'SECRET_INSTRUCTION_GOLD_DOME',feedback:'SECRET_FEEDBACK'};
 const prior=[{phase:'capture',data:{impressions:[{id:'v01-capture-1',category:'Libre',text:'OWN_CAPTURE',intensity:null,feedback:'SECRET_NESTED'}],relations:[],hypotheses:[{text:'SECRET_HYPOTHESIS'}],abstention:'SECRET_ABSTENTION'},raw:'SECRET_RAW'}, {phase:'interpret',data:{impressions:[],relations:['SECRET_FUTURE'],hypotheses:[]}}];
 for(const viewerGuidance of [undefined,'neutral'])for(const phase of ['capture','structure','interpret']){
   const input=capturePrompt('OPAQUE', {...poisoned,viewerGuidance}, phase, prior);
   assert.doesNotMatch(JSON.stringify(input),/SECRET_/);
   const data=JSON.parse(input[1].content[0].text);
   assert.equal(data.ownSealedPhases.length,phase==='capture'?0:1);
   if(phase==='capture')assert.doesNotMatch(input[0].content[0].text,/Fase: estructura|Fase: interpretación|identidades o escenas/);
   if(phase==='structure')assert.doesNotMatch(input[0].content[0].text,/Fase: interpretación/);
 }
 const custom=capturePrompt('OPAQUE',{...poisoned,viewerGuidance:'custom'},'capture',[]);
 assert.deepEqual(JSON.parse(custom[1].content[0].text).optionalGuidance,{categories:poisoned.categories,instructions:poisoned.instructions});
});

test('actual viewer requests exclude target, history and code semantics; feedback images reach judges only',async()=>{
 const bodies=[],saved=[];
 const engine=new Engine({accounts,persist:async j=>saved.push(j),fetcher:async(_u,opts)=>{
   const body=JSON.parse(opts.body),data=JSON.parse(body.input[1].content[0].text);bodies.push(body);
   assert.deepEqual(Object.keys(body).sort(),['model','input','store','stream','max_output_tokens'].sort());
   if(data.claims)return stream(JSON.stringify({assessments:data.claims.map(c=>({claimId:c.id,verdict:'unverifiable',reason:'Test',evidence:''})),summary:'Test'}));
   return stream(reply(data));
 }});
 const id=randomUUID(), hints={...config,agents:2,categories:['SECRET_CATEGORY'],instructions:'SECRET_INSTRUCTION'};
 await engine.start({id,code:'SECRET_CODE_TOWER',config:hints,privateTarget:'SECRET_TARGET',feedback:'SECRET_FEEDBACK',images:['SECRET_IMAGE'],history:['SECRET_HISTORY']});
 await assert.rejects(()=>engine.evaluate({id,evidence:'Early'}),/Primero cierra/);
 await until(()=>engine.jobs.get(id).status!=='running'&&!engine.controllers.size);
 const job=engine.jobs.get(id),sealed=JSON.stringify(job.sessions),viewers=bodies.slice();
 assert.doesNotMatch(JSON.stringify(viewers),/SECRET_/);
 assert.match(job.viewerCode,/^[0-9a-f-]{36}$/);
 for(const s of job.sessions)for(const p of s.phases){
   assert.equal(p.promptHash,digest(p.prompt));
   assert.ok(viewers.some(b=>JSON.stringify(b.input)===JSON.stringify(p.prompt)));
   const d=JSON.parse(p.prompt[1].content[0].text);
   for(const old of d.ownSealedPhases)for(const c of old.data.impressions)assert.ok(c.id.startsWith(s.id+'-'));
 }
 const image='data:image/png;base64,VEVTVA==';
 await engine.evaluate({id,evidence:'SECRET_FEEDBACK',images:[image],judgeModel:'model-b',judges:1,evidenceHash:digest('e'),evidenceVersion:digest('v')});
 await until(()=>job.evaluation.status!=='running'&&!engine.controllers.size);
 const judge=bodies.at(-1);assert.equal(JSON.parse(judge.input[1].content[0].text).evidence,'SECRET_FEEDBACK');assert.equal(judge.input[1].content[1].image_url,image);
 assert.equal(JSON.stringify(job.sessions),sealed);
 const before=bodies.length,next=randomUUID();
 await engine.start({id:next,code:'SECRET_NEXT_CODE',config:{...hints,agents:1,phases:'capture'}});
 await until(()=>engine.jobs.get(next).status!=='running'&&!engine.controllers.size);
 assert.notEqual(engine.jobs.get(next).viewerCode,job.viewerCode);
 assert.doesNotMatch(JSON.stringify(bodies.slice(before)),/SECRET_|OWN_CAPTURE/);
 assert.deepEqual(JSON.parse(bodies.at(-1).input[1].content[0].text).ownSealedPhases,[]);
});

test('later phases cannot add impressions and hypotheses must cite this viewer',async()=>{
 for(const phase of ['structure','interpret']){
  let calls=0;const engine=new Engine({accounts,persist:async()=>{},fetcher:async(_u,opts)=>{
   calls++;const data=JSON.parse(JSON.parse(opts.body).input[1].content[0].text);
   if(data.phase===phase)return stream(phase==='structure'?capture:JSON.stringify({impressions:[],relations:[],hypotheses:[{text:'Unsupported',basedOn:['v99-capture-1']}],abstention:null}));
   return stream(reply(data));
  }});
  const id=randomUUID();await engine.start({id,code:'TEST',config:{...config,agents:1}});await until(()=>engine.jobs.get(id).status!=='running');
  const s=engine.jobs.get(id).sessions[0];assert.equal(s.status,'error');assert.equal(calls,phase==='structure'?2:3);
  assert.equal(s.phases.flatMap(p=>p.data.impressions).length,1);assert.equal(s.failures.length,1);assert.equal(s.failures[0].promptHash,digest(s.failures[0].prompt));
 }
});
