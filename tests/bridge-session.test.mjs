import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {bridgeSessionKey,readBridgeSession,saveBridgeSession,clearBridgeSession,acceptsBridgeMessage} from '../lib/bridge-session.ts';
const session={origin:'http://127.0.0.1:1455',channel:'76a60442-e494-48cd-ac5e-f089adabc790'};
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
const message=(source,overrides={})=>({origin:session.origin,source,data:{type:'limen:ready',channel:session.channel,status:{selected:'account-id'}},...overrides});

test('reload metadata round trips without restoring accounts or credential fields',()=>{
 const s=storage();saveBridgeSession(s,{...session,selected:'account-id',token:'must-not-persist'});
 assert.deepEqual(JSON.parse(s.getItem(bridgeSessionKey)),session);assert.deepEqual(readBridgeSession(s),session);
 clearBridgeSession(s);assert.equal(readBridgeSession(s),null);
});
test('invalid stored endpoints or channels cannot authorize a restored connection',()=>{
 for(const value of [null,'broken',{...session,channel:''},{...session,channel:'guessable'},{...session,origin:'https://evil.example'},{...session,origin:'http://localhost:1455'},{...session,origin:'http://127.0.0.1:80'},{...session,origin:'http://127.0.0.1:1455/path'},{...session,origin:'http://user:password@127.0.0.1:1455'}]){
  const s=storage();s.setItem(bridgeSessionKey,JSON.stringify(value));assert.equal(readBridgeSession(s),null);
 }
 assert.equal(readBridgeSession({getItem(){throw new Error('Storage blocked');}}),null);
});
test('only a matching ready message may restore a window, then source identity stays pinned',()=>{
 const popup={postMessage(){}},other={postMessage(){}};
 assert.equal(acceptsBridgeMessage(message(popup),session,null,true),true);
 for(const event of [message(null),message(popup,{origin:'https://evil.example'}),message(popup,{data:{type:'limen:ready',channel:'wrong'}}),message(popup,{data:{type:'limen:response',channel:session.channel}})])assert.equal(acceptsBridgeMessage(event,session,null,true),false);
 assert.equal(acceptsBridgeMessage(message(popup),session,null,false),false);
 assert.equal(acceptsBridgeMessage(message(other),session,popup,false),false);
 assert.equal(acceptsBridgeMessage(message(popup),session,popup,false),true);
});
test('existing 1.0.2 bridge heartbeat can restore a reloaded Site without another OAuth call',async()=>{
 const site='https://limen-rv.zeros.chatgpt.site',s=storage();saveBridgeSession(s,session);
 const state={version:'1.0.2',selected:'account-id',accounts:[{id:'account-id',label:'Test account',connected:true}],jobs:[]};
 const elements=Object.fromEntries(['message','accounts','connect','disconnect','bridge-config'].map(id=>[id,{dataset:{site,token:'local-rpc-token'},replaceChildren(){}}]));
 let tick,received=[],restored=null;const methods=[];const popup={postMessage(){}};
 const opener={postMessage(data,targetOrigin){assert.equal(targetOrigin,site);received.push(data);if(acceptsBridgeMessage({origin:session.origin,source:popup,data},readBridgeSession(s),null,true))restored=data.status;}};
 runInNewContext(await readFile(new URL('../companion/bridge.js',import.meta.url),'utf8'),{
  document:{getElementById:id=>elements[id]},location:{href:session.origin+'/?channel='+session.channel},URL,
  window:{opener,addEventListener(){},open(){throw new Error('Reload must not open OAuth');}},
  Option:function(label,value){this.label=label;this.value=value;},
  setInterval(fn){tick=fn;},
  fetch:async(_url,opts)=>{methods.push(JSON.parse(opts.body).method);return {ok:true,json:async()=>({result:state})};}
 });
 await new Promise(resolve=>setImmediate(resolve));assert.equal(restored.selected,'account-id');
 // A reload loses the in-memory state; the next heartbeat restores it from the
 // existing child window, after validating the stored origin and random channel.
 restored=null;await tick();assert.equal(restored.selected,'account-id');
 assert.deepEqual(methods,['status','status']);assert.equal(received.length,2);
});
