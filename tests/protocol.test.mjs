import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,initialConfig} from '../lib/lab.ts';
import {validateSnapshot} from '../lib/validate-snapshot.ts';
import {Engine,viewerProtocol} from '../companion/engine.mjs';
import {phasePlan} from '../companion/viewer-flow.mjs';
import {reply,stream,until} from '../companion/test/fixtures.mjs';
const config={...initialConfig,models:['test'],agents:1,phases:'capture'};
async function fixture(){const phase={phase:'capture',at:'2026-10-12T00:00:00Z',data:{impressions:[{id:'v01-capture-1',category:'Otra',text:'Una impresión.',intensity:.5}],relations:[],hypotheses:[],abstention:null},raw:'{}',usage:{},responseId:'test'};const sessions=[{id:'v01',model:'test',status:'completed',phases:[{...phase,hash:await hash(phase)}]}];const s={id:'test-id',code:'1234',config,protocolHash:await hash(config),status:'sealed',revision:2,sessions,resultHash:await hash(sessions)};return {s,row:{id:'test-id',code:'1234',config:JSON.stringify(config),snapshot:null}};}
test('snapshot accepts the exact fixed protocol and verified phase hashes',async()=>{const {s,row}=await fixture();assert.equal((await validateSnapshot(s,row)).status,'sealed');});
test('phase tampering, changed models and premature sealing are rejected',async()=>{for(const mutate of [s=>s.sessions[0].phases[0].data.impressions[0].text='Changed',s=>s.sessions[0].model='another',s=>s.sessions[0].status='running']){const {s,row}=await fixture();mutate(s);await assert.rejects(()=>validateSnapshot(s,row));}});
test('previously sealed phases cannot be replaced even with recomputed hashes',async()=>{const {s,row}=await fixture();row.snapshot=JSON.stringify({...s,status:'running',revision:1});s.sessions[0].phases[0].raw='modified';const {hash:old,...phase}=s.sessions[0].phases[0];s.sessions[0].phases[0].hash=await hash(phase);s.resultHash=await hash(s.sessions);await assert.rejects(()=>validateSnapshot(s,row),/reescribir/);});

async function emptyFixture(stopOnEmpty=true){
 const {s,row}=await fixture();s.config={...s.config,phases:'structured',stopOnEmpty};s.protocolHash=await hash(s.config);row.config=JSON.stringify(s.config);
 const agent=s.sessions[0];agent.status='abstained';agent.phases[0].data={impressions:[],relations:[],hypotheses:[],abstention:'No propongo candidatos.'};
 const {hash:old,...record}=agent.phases[0];agent.phases[0].hash=await hash(record);s.resultHash=await hash(s.sessions);return {s,row};
}
test('early abstention accepts a sealed empty capture without requiring later phases',async()=>{const {s,row}=await emptyFixture();assert.equal((await validateSnapshot(s,row)).status,'sealed');});
test('abstention cannot hide missing or nonempty phases or override the fixed continuation policy',async()=>{
 for(const mutate of [s=>s.sessions[0].phases=[],s=>s.sessions[0].phases[0].data.relations=['A relation'],s=>s.sessions[0].phases.push(s.sessions[0].phases[0])]){const {s,row}=await emptyFixture();mutate(s);await assert.rejects(()=>validateSnapshot(s,row));}
 const {s,row}=await emptyFixture(false);await assert.rejects(()=>validateSnapshot(s,row),/abstención/);
});
test('legacy configs and empty completed sessions keep their original protocol hashes',async()=>{
 const {s,row}=await emptyFixture();delete s.config.stopOnEmpty;s.config.phases='capture';s.sessions[0].status='completed';s.protocolHash=await hash(s.config);s.resultHash=await hash(s.sessions);row.config=JSON.stringify(s.config);
 assert.equal((await validateSnapshot(s,row)).status,'sealed');assert.equal(s.config.stopOnEmpty,undefined);
});

async function auditedFixture(){
 const f=await fixture(),s=f.s;s.viewerProtocol='blind-phase-isolation-v3';s.viewerCode=crypto.randomUUID();
 const p=s.sessions[0].phases[0];p.prompt=[{role:'developer',content:[{type:'input_text',text:'Historical v3 fixture.'}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({targetCode:s.viewerCode,phase:'capture',ownSealedPhases:[]})}]}];p.promptHash=await hash(p.prompt);
 const {hash:old,...record}=p;p.hash=await hash(record);s.resultHash=await hash(s.sessions);return f;
}
test('audited prompts and alias are accepted and locked independently of user code',async()=>{
 const {s,row}=await auditedFixture();assert.equal((await validateSnapshot(s,row)).status,'sealed');
 row.snapshot=JSON.stringify({...s,status:'running',revision:1});
 for(const change of ['viewerCode','viewerProtocol']){const copy=structuredClone(s);copy[change]=change==='viewerCode'?crypto.randomUUID():'other';await assert.rejects(()=>validateSnapshot(copy,row),/no se pueden cambiar/);}
});
test('neutral audit rejects extra prompt fields, foreign context and altered prompt hashes',async()=>{
 for(const tamper of [
  p=>p.promptHash='0'.repeat(64),
  p=>{const d=JSON.parse(p.prompt[1].content[0].text);d.feedback='Hidden reference';p.prompt[1].content[0].text=JSON.stringify(d);},
  p=>{const d=JSON.parse(p.prompt[1].content[0].text);d.ownSealedPhases=[{phase:'capture',data:{impressions:[],relations:[]}}];p.prompt[1].content[0].text=JSON.stringify(d);},
  p=>{const d=JSON.parse(p.prompt[1].content[0].text);d.targetCode='Human target label';p.prompt[1].content[0].text=JSON.stringify(d);}
 ]){
  const {s,row}=await auditedFixture(),p=s.sessions[0].phases[0];tamper(p);
  if(p.promptHash!=='0'.repeat(64))p.promptHash=await hash(p.prompt);
  const {hash:old,...record}=p;p.hash=await hash(record);s.resultHash=await hash(s.sessions);
  await assert.rejects(()=>validateSnapshot(s,row));
 }
});

test('real v4 snapshots validate on the Site at every phase, for both guidance modes and pass limits',async()=>{
 for(const viewerGuidance of ['neutral','custom'])for(const capturePasses of [1,3]){
  const c={...config,viewerGuidance,capturePasses,agents:2,phases:'structured',categories:['Una categoría'],instructions:'Una orientación.'};
  const row={id:crypto.randomUUID(),code:'Private label',config:JSON.stringify(c),snapshot:null};
  const validations=[];
  const engine=new Engine({accounts:{selected:()=>({id:'test'}),models:async()=>[{id:'test'}],access:async()=>'test'},persist:async job=>{
   validations.push(await validateSnapshot(job,row));row.snapshot=JSON.stringify(job);
  },fetcher:async(_u,opts)=>stream(reply(JSON.parse(JSON.parse(opts.body).input[1].content[0].text)))});
  await engine.start({id:row.id,code:row.code,config:c});await until(()=>!engine.controllers.size);
  const result=engine.jobs.get(row.id);assert.equal(result.status,'sealed',result.error);assert.equal(result.viewerProtocol,viewerProtocol);
  assert.ok(result.sessions.every(s=>s.phases.length===phasePlan(c).length));assert.ok(validations.length>6);assert.equal(validations.at(-1).status,'sealed');
  assert.ok(result.sessions[0].phases.at(-1).data.composition.overview.basedOn.length);
  // Hashes alone cannot authorize a changed prompt or a made-up parsed output.
  for(const tamper of [p=>p.prompt[0].content[0].text+=' Added instruction.',p=>p.data.impressions[0].text='Fabricated parsed text']){
   const modified=structuredClone(result),p=modified.sessions[0].phases[0];tamper(p);p.promptHash=await hash(p.prompt);
   const {hash:old,...record}=p;p.hash=await hash(record);modified.resultHash=await hash(modified.sessions);
   await assert.rejects(()=>validateSnapshot(modified,{...row,snapshot:null}));
  }
 }
});
test('v4 empty opening continues collection and only then seals abstention',async()=>{
 const c={...config,phases:'structured',capturePasses:2},row={id:crypto.randomUUID(),code:'Empty run',config:JSON.stringify(c),snapshot:null};
 const seen=[];
 const engine=new Engine({accounts:{selected:()=>({id:'test'}),models:async()=>[{id:'test'}],access:async()=>'test'},persist:async job=>{
  await validateSnapshot(job,row);row.snapshot=JSON.stringify(job);seen.push(structuredClone(job));
 },fetcher:async(_u,opts)=>stream(reply(JSON.parse(JSON.parse(opts.body).input[1].content[0].text),true))});
 await engine.start({id:row.id,code:row.code,config:c});await until(()=>!engine.controllers.size);
 const result=engine.jobs.get(row.id);assert.equal(result.status,'sealed',result.error);assert.equal(result.sessions[0].status,'abstained');
 assert.deepEqual(result.sessions[0].phases.map(p=>p.phase),['opening','capture','capture2']);
 assert.ok(seen.some(s=>s.sessions[0].phases.length===1&&s.sessions[0].status==='running'));
 const premature=structuredClone(result);premature.sessions[0].phases.length=1;premature.resultHash=await hash(premature.sessions);
 await assert.rejects(()=>validateSnapshot(premature,{...row,snapshot:null}),/abstención/);
});
