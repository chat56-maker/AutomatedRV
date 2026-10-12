import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePrompt,parseCapture,phasePlan} from '../viewer-flow.mjs';
import {config,reply} from './fixtures.mjs';
const opening=()=>({phase:'opening',data:parseCapture(JSON.stringify({perceptions:['Fragmento A','Fragmento B'],abstention:null}),'v01','opening',[],config)});
const user=input=>JSON.parse(input[1].content[0].text);

test('opening has only free fragments: no category hints, scoring, examples or later instructions',()=>{
 for(const viewerGuidance of ['neutral','custom']){
  const p=capturePrompt('OPAQUE',{...config,viewerGuidance,instructions:'SECRET_HINT',categories:['SECRET_TYPE']},'opening',[opening()]);
  assert.deepEqual(user(p),{targetCode:'OPAQUE',phase:'opening',ownSealedPhases:[]});assert.doesNotMatch(JSON.stringify(p),/SECRET_|optionalGuidance|Fase: estructura|Formato JSON: impressions/);
  assert.match(p[0].content[0].text,/atención abierta/);assert.match(p[0].content[0].text,/sin categorías ni puntuaciones/);
 }
 const direct=capturePrompt('OPAQUE',{...config,attentionMode:'direct'},'opening',[]);assert.doesNotMatch(direct[0].content[0].text,/Preparación de atención abierta/);
});
test('contemplative preparation is repeated only during collection and custom guidance starts after opening',()=>{
 for(const phase of phasePlan(config)){
  const p=capturePrompt('OPAQUE',{...config,viewerGuidance:'custom',instructions:'CUSTOM'},phase,[]);
  assert.equal(p[0].content[0].text.includes('Preparación de atención abierta'),phase==='opening'||phase.startsWith('capture'));
  assert.equal(!!user(p).optionalGuidance,phase.startsWith('capture'));
 }
});
test('several impressions in one category and unclassified fragments are retained',()=>{
 const prior=[opening()],raw={impressions:[{text:'Detalle primero',category:'La misma',basedOn:['v01-opening-1']},{text:'Detalle segundo',category:'La misma',basedOn:[]},{text:'Detalle tercero',category:null,basedOn:[]}],associations:['ASSOCIATION_NOT_A_CLAIM'],abstention:null};
 const d=parseCapture(JSON.stringify(raw),'v01','capture',prior,config);assert.equal(d.impressions.length,3);assert.equal(d.impressions[0].category,d.impressions[1].category);assert.equal(d.impressions[2].category,'Sin clasificar');assert.equal(d.associations.length,1);
 const p=capturePrompt('OPAQUE',config,'capture2',[...prior,{phase:'capture',data:d,raw:'SECRET_RAW'}]);assert.doesNotMatch(JSON.stringify(p),/ASSOCIATION_NOT_A_CLAIM|SECRET_RAW/);
});
test('literal recurrence is preserved with a link, without equating similar but distinct observations',()=>{
 const prior=[opening()],d=parseCapture(JSON.stringify({impressions:[{text:'fragmento a.',category:null,basedOn:[]},{text:'Fragmento A con otro matiz',category:null,basedOn:[]}],associations:[],abstention:null}),'v01','capture',prior,config);
 assert.equal(d.impressions[0].duplicateOf,'v01-opening-1');assert.equal(d.impressions[1].duplicateOf,undefined);
});
test('new impression ceiling accepts a rich same-category record and rejects overflow, without a minimum',()=>{
 const perceptions=Array.from({length:35},(_,i)=>`Fragmento distinto ${i}`);
 assert.equal(parseCapture(JSON.stringify({perceptions,abstention:null}),'v01','opening',[],config).impressions.length,35);
 assert.throws(()=>parseCapture(JSON.stringify({perceptions,abstention:null}),'v01','opening',[],{...config,maxImpressions:10}),/Lista/);
 assert.equal(parseCapture(JSON.stringify({perceptions:[],abstention:'Sin impresiones'}),'v01','opening',[],config).impressions.length,0);
});
test('structure and composition reject outside references and cannot add observations',()=>{
 const prior=[opening()];
 for(const phase of ['structure','compose']){
  const p=capturePrompt('OPAQUE',config,phase,prior),raw=JSON.parse(reply(user(p)));
  raw.impressions=[{text:'Injected'}];assert.throws(()=>parseCapture(JSON.stringify(raw),'v01',phase,prior,config),/Campos/);
 }
 const raw={overview:{text:'Unfounded',basedOn:['v02-opening-1']},elements:[],layout:[],alternatives:[],unresolved:[],abstention:null};
 assert.throws(()=>parseCapture(JSON.stringify(raw),'v01','compose',prior,config),/Referencias/);
 assert.throws(()=>parseCapture(JSON.stringify({groups:[],relations:[{text:'Relation',basedOn:['v01-opening-1']}],uncertainties:[],abstention:null}),'v01','structure',prior,config),/Referencias/);
});
test('composition may cite the viewers own relationships, preserves alternatives and unknowns',()=>{
 const prior=[opening()];const data=parseCapture(reply(user(capturePrompt('OPAQUE',config,'structure',prior))),'v01','structure',prior,config);prior.push({phase:'structure',data});
 const result=parseCapture(reply(user(capturePrompt('OPAQUE',config,'compose',prior))),'v01','compose',prior,config);
 assert.equal(result.composition.layout[0].basedOn[0],'v01-structure-r1');assert.equal(result.composition.unresolved.length,1);assert.deepEqual(result.impressions,[]);
});
