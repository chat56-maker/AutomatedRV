import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Accounts} from '../oauth.mjs';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';

test('OAuth uses fresh PKCE/state/nonce and rejects unsolicited callbacks',async()=>{
 await mkdir('test/.tmp',{recursive:true});const dir=await mkdtemp('test/.tmp/oauth-');
 try{const a=await new Accounts(dir,'http://127.0.0.1:1455/auth/callback').init();const first=new URL(a.begin().url), second=new URL(a.begin().url);
 assert.equal(second.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(second.searchParams.get('resource'),'https://api.openai.com/v1');assert.ok(second.searchParams.get('scope').includes('chatgpt.tokens.use.direct'));assert.notEqual(first.searchParams.get('state'),second.searchParams.get('state'));assert.notEqual(first.searchParams.get('nonce'),second.searchParams.get('nonce'));assert.equal(second.searchParams.get('code_challenge_method'),'S256');
 await assert.rejects(()=>a.callback(new URLSearchParams({state:'wrong',code:'test'})),/estado/);assert.equal(a.list().accounts.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('OAuth validates signed ID token, serializes rotating refresh, and retains client on logout',async()=>{
 await mkdir('test/.tmp',{recursive:true});const dir=await mkdtemp('test/.tmp/tokens-'),originalFetch=globalThis.fetch;
 try{const a=await new Accounts(dir,'http://127.0.0.1:1455/auth/callback').init();a.begin();const pending=a.pending;
 const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='test';
 a.meta={issuer:'https://auth.openai.com',revocation_endpoint:'https://auth.openai.com/revoke'};a.jwks=createLocalJWKSet({keys:[jwk]});
 const jwt=await new SignJWT({nonce:pending.nonce,email:'test@example.invalid'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('test-user').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 let refreshCalls=0;
 globalThis.fetch=async(url,opts)=>{const params=opts.body;if(String(url).endsWith('/revoke'))return new Response('',{status:200});assert.equal(params.get('client_id'),'oaiapp_test');if(params.get('grant_type')==='refresh_token'){refreshCalls++;await new Promise(r=>setTimeout(r,10));return Response.json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600});}assert.equal(params.get('code_verifier'),pending.verifier);return Response.json({id_token:jwt,access_token:'test-access',refresh_token:'test-refresh',scope:'openid chatgpt.tokens.use.direct',expires_in:1});};
 await a.callback(new URLSearchParams({state:pending.state,code:'test-code',issued_client_id:'oaiapp_test'}));const id=a.selected().id;
 const tokens=await Promise.all(Array.from({length:8},()=>a.access(id)));assert.equal(refreshCalls,1);assert.ok(tokens.every(t=>t==='rotated-access'));
 const saved=JSON.parse(await readFile(join(dir,'accounts.json'),'utf8'));assert.equal(saved.accounts[0].refresh,'rotated-refresh');assert.ok(!JSON.stringify(a.list()).includes('rotated-'));
 assert.equal((await a.logout(id)).revoked,true);assert.equal(a.data.accounts[0].client,'oaiapp_test');assert.equal(a.data.accounts[0].refresh,undefined);assert.equal(a.list().selected,null);
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});
