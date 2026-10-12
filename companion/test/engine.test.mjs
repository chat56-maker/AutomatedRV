import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Engine,readResponse,digest} from '../engine.mjs';
const config={models:['model-a','model-b'],agents:4,concurrency:2,phases:'structured',reasoning:'default',maxTokens:1000,timeout:30,categories:['Presión','Otra'],instructions:'Protocolo de prueba.',judgeModel:'model-b',judges:2};
const accounts={selected:()=>({id:'test-account'}),access:async()=> 'test-token',models:async()=>[{id:'model-a'},{id:'model-b'}]};
const capture=JSON.stringify({impressions:[{category:'Presión',text:'Presión leve hacia arriba.',intensity:.4}],relations:['Encima de una superficie.'],hypotheses:[],abstention:null});
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
 const engine=new Engine({accounts,persist:async j=>saved.push(j),fetcher:async(_url,opts)=>{active++;maximum=Math.max(maximum,active);calls++;const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.equal(body.tools,undefined);inputs.push(body);await new Promise(r=>setTimeout(r,4));active--;return stream(capture);}});
 const id=randomUUID();await Promise.all(Array.from({length:5},()=>engine.start({id,code:'TARGET-123',config,privateTarget:'THIS MUST NEVER ENTER PROMPTS'})));
 await until(()=>engine.jobs.get(id).status!=='running');const job=engine.jobs.get(id);
 assert.equal(job.status,'sealed');assert.equal(calls,12);assert.equal(maximum,2);assert.equal(job.resultHash,digest(job.sessions));
 for(const input of inputs){assert.ok(!JSON.stringify(input).includes('THIS MUST'));const user=JSON.parse(input.input[1].content[0].text);assert.equal(user.targetCode,'TARGET-123');if(user.phase==='capture')assert.deepEqual(user.ownSealedPhases,[]);else{const ids=user.ownSealedPhases.flatMap(p=>p.data.impressions.map(c=>c.id.split('-')[0]));assert.equal(new Set(ids).size,1);}}
 for(const s of job.sessions){assert.equal(s.phases.length,3);for(const p of s.phases){const {hash,...raw}=p;assert.equal(hash,digest(raw));}}
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
 const engine=new Engine({accounts,persist:async()=>{},fetcher:async(_u,opts)=>{const body=JSON.parse(opts.body),data=JSON.parse(body.input[1].content[0].text);if(!data.claims)return stream(capture);assert.equal(data.evidence,'Reference material');return stream(JSON.stringify({assessments:data.claims.map(c=>({claimId:c.id,verdict:'unverifiable',reason:'No verification.',evidence:''})),summary:'Limited evidence.'}));}});
 const id=randomUUID();await engine.start({id,code:'JUDGE',config:{...config,agents:1,phases:'capture'}});await until(()=>engine.jobs.get(id).status!=='running'&&!engine.controllers.size);
 const payload={id,evidence:'Reference material',judgeModel:'model-b',judges:2,evidenceHash:digest('reference'),evidenceVersion:digest('version')};
 await Promise.all([engine.evaluate(payload),engine.evaluate(payload)]);await until(()=>engine.jobs.get(id).evaluation.status!=='running');
 const evaluation=engine.jobs.get(id).evaluation;assert.equal(evaluation.judges.length,2);assert.ok(evaluation.judges.every(j=>j.status==='completed'));assert.equal(evaluation.evidenceVersion,payload.evidenceVersion);
 const again=await engine.evaluate(payload);assert.equal(again.createdAt,evaluation.createdAt);
});
