import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,initialConfig} from '../lib/lab.ts';
import {validateSnapshot} from '../lib/validate-snapshot.ts';
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
