import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule} from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';

// Exercise the real route, validation and HTTP helpers. Only host identity and
// the D1 adapter are substituted; no production preferences or plan usage.
async function harness(){
 const rows=new Map(),writes=[];
 const preferences={owner:'preferences.owner'},runs={owner:'runs.owner',createdAt:'runs.createdAt'};
 const db={
  insert:table=>({values:value=>({onConflictDoUpdate:async conflict=>{assert.equal(table,preferences);assert.equal(conflict.target,preferences.owner);writes.push({value,conflict});rows.set(value.owner,{config:conflict.set.config});}})}),
  select:()=>({from:table=>({where:condition=>({get:async()=>rows.get(condition.right),orderBy:()=>({limit:async()=>[]})})})})
 };
 const cache=new Map();
 const external={
  'zod':zod,
  '@/db':{getDb:()=>db},
  '@/db/schema':{preferences,runs,events:{},files:{}},
  'drizzle-orm':{eq:(left,right)=>({left,right}),desc:x=>x,and:(...x)=>x},
  '@/app/chatgpt-auth':{getChatGPTUser:async()=>({userId:'owner-test'})},
 };
 const paths={'route':'../app/api/state/route.ts','@/lib/server':'../lib/server.ts','@/lib/lab':'../lib/lab.ts'};
 async function load(name){
  if(cache.has(name))return cache.get(name);
  let mod;
  if(external[name]){const exports=external[name];mod=new SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);});}
  else {assert.ok(paths[name],`Unexpected module: ${name}`);const source=await readFile(new URL(paths[name],import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;mod=new SourceTextModule(code,{identifier:name});}
  cache.set(name,mod);await mod.link(load);return mod;
 }
 const route=await load('route');await route.evaluate();
 const lab=cache.get('@/lib/lab').namespace;
 const config={...lab.initialConfig,models:['test-model'],agents:6,concurrency:6,reasoning:'low'};
 const post=async payload=>{const req=new Request('https://test.example/api/state',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://test.example'},body:JSON.stringify(payload)});return route.namespace.POST(req);};
 return {route:route.namespace,rows,writes,config,post};
}

test('saving the UI config envelope persists the protocol and GET restores it',async()=>{
 const h=await harness();const response=await h.post({config:h.config});
 assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.json(),{ok:true});
 assert.equal(h.writes.length,1);assert.equal(h.writes[0].value.owner,'owner-test');assert.deepEqual(JSON.parse(h.writes[0].value.config),h.config);
 const state=await h.route.GET();assert.equal(state.status,200);assert.deepEqual((await state.json()).config,h.config);
 const updated={...h.config,agents:3};assert.equal((await h.post({config:updated})).status,200);assert.equal(h.rows.size,1);assert.deepEqual((await (await h.route.GET()).json()).config,updated);
});

test('invalid protocol is rejected without replacing saved preferences',async()=>{
 const h=await harness();assert.equal((await h.post({config:h.config})).status,200);
 for(const payload of [{},{config:null},{config:{...h.config,models:[]}},{config:{...h.config,agents:0}},{config:{...h.config,concurrency:99}}]){
  const response=await h.post(payload);assert.equal(response.status,400);assert.ok((await response.json()).error);
 }
 assert.equal(h.writes.length,1);assert.deepEqual(JSON.parse(h.rows.get('owner-test').config),h.config);
});

test('protocol writes still require the same-origin request',async()=>{
 const h=await harness();const response=await h.route.POST(new Request('https://test.example/api/state',{method:'POST',headers:{Origin:'https://foreign.example'},body:JSON.stringify({config:h.config})}));
 assert.equal(response.status,403);assert.equal(h.writes.length,0);
});
