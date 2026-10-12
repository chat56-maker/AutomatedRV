import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {createRemoteJWKSet, jwtVerify} from 'jose';

const RESOURCE = 'https://api.openai.com/v1';
const AUTH = 'https://auth.openai.com/api/accounts/authorize';
const TOKEN = 'https://auth.openai.com/api/accounts/oauth/token';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const random = () => randomBytes(32).toString('base64url');
export async function atomic(path, value) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), {mode: 0o600});
  await rename(tmp, path);
  await chmod(path, 0o600);
}
async function remoteJSON(url, options = {}) {
  const r = await fetch(url, {...options, signal: AbortSignal.timeout(30000)});
  let data; try { data = await r.json(); } catch { throw new Error(`OpenAI devolvió HTTP ${r.status}.`); }
  if (!r.ok) throw new Error(data.error?.message || data.error_description || (typeof data.error === 'string' ? data.error : `HTTP ${r.status}`));
  return data;
}
export class Accounts {
  constructor(dir, redirect) { this.dir = dir; this.redirect = redirect; this.locks = new Map(); this.pending = null; }
  async init() {
    await mkdir(this.dir, {recursive:true, mode:0o700});
    await chmod(this.dir, 0o700);
    this.path = join(this.dir, 'accounts.json');
    try { this.data = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.data = {host:`urn:uuid:${randomUUID()}`, selected:null, accounts:[]}; await this.save(); }
    return this;
  }
  async save() { const copy=structuredClone(this.data);this.writeQueue=(this.writeQueue||Promise.resolve()).catch(()=>{}).then(()=>atomic(this.path,copy));await this.writeQueue; }
  list() { return {selected:this.data.selected, accounts:this.data.accounts.map(a => ({id:a.id, label:a.label, connected:!!a.refresh, expiresAt:a.expiresAt}))}; }
  selected() { const a=this.data.accounts.find(a=>a.id===this.data.selected); if (!a?.refresh) throw new Error('Conecta una cuenta de ChatGPT en la ventana del conector.'); return a; }
  async select(id) { if (!this.data.accounts.find(a=>a.id===id&&a.refresh)) throw new Error('Cuenta no conectada.'); this.data.selected=id; await this.save(); return this.list(); }
  begin(id) {
    const old=id ? this.data.accounts.find(a=>a.id===id) : null;
    if (id && !old) throw new Error('Cuenta desconocida.');
    const p={state:random(), nonce:random(), verifier:random(), expires:Date.now()+600000, client:old?.client, account:old?.id};
    this.pending=p;
    const u=new URL(AUTH);
    const params={client_id:old?.client || 'dynamic_agent_client', response_type:'code', redirect_uri:this.redirect, scope:SCOPE, resource:RESOURCE, state:p.state, nonce:p.nonce, code_challenge:createHash('sha256').update(p.verifier).digest('base64url'),code_challenge_method:'S256',ext_agent_host_id:this.data.host};
    if (!old) params.agent_name_hint='Limen RV';
    if (old?.idToken) params.id_token_hint=old.idToken;
    for (const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
    return {url:u.href};
  }
  async discovery() {
    if (!this.meta) {
      this.meta=await remoteJSON('https://auth.openai.com/.well-known/openid-configuration');
      if (this.meta.issuer !== 'https://auth.openai.com' || new URL(this.meta.jwks_uri).origin !== 'https://auth.openai.com') throw new Error('Emisor OAuth inesperado.');
      this.jwks=createRemoteJWKSet(new URL(this.meta.jwks_uri));
    }
    return this.meta;
  }
  async callback(params) {
    const p=this.pending;
    if (!p || p.expires<Date.now() || params.get('state')!==p.state) throw new Error('La autorización expiró o su estado no coincide. Vuelve a conectar.');
    this.pending=null;
    if (params.has('error')) throw new Error(`Autorización cancelada: ${params.get('error')}`);
    // New registrations return the issued value in the client_id query field.
    // Only a returning authorization may omit it and reuse its pending client.
    const returnedClient=params.get('client_id');
    const client=returnedClient===null?p.client:returnedClient;
    if (!client?.startsWith('oaiapp_') || (p.client && client!==p.client) || !params.get('code')) throw new Error('Respuesta OAuth incompleta o cliente incorrecto.');
    const token=await remoteJSON(TOKEN,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:client,code:params.get('code'),code_verifier:p.verifier,redirect_uri:this.redirect,resource:RESOURCE})});
    if (!token.id_token || !token.refresh_token || !token.access_token) throw new Error('OAuth no devolvió una sesión completa.');
    await this.discovery();
    const {payload}=await jwtVerify(token.id_token,this.jwks,{issuer:this.meta.issuer,audience:client,requiredClaims:['sub','exp','iat','nonce'],clockTolerance:5});
    if (payload.nonce!==p.nonce) throw new Error('Nonce OAuth incorrecto.');
    const granted=String(token.scope || params.get('scope') || '').split(' ');
    if (!granted.includes('chatgpt.tokens.use.direct')) throw new Error('No se concedió permiso para usar el plan de ChatGPT.');
    const id=`${client}:${payload.sub}`;
    if (p.account && id!==p.account) throw new Error('La cuenta autorizada no coincide con la cuenta que se estaba renovando.');
    const account={id,client,sub:payload.sub,label:payload.email || payload.name || 'Cuenta ChatGPT',access:token.access_token,refresh:token.refresh_token,idToken:token.id_token,expiresAt:Date.now()+Number(token.expires_in||3600)*1000};
    this.data.accounts=this.data.accounts.filter(a=>a.id!==id); this.data.accounts.push(account); this.data.selected=id; await this.save();
  }
  async access(id) {
    const a=this.data.accounts.find(a=>a.id===id);
    if (!a?.refresh) throw new Error('La cuenta fue desconectada.');
    if (a.access && a.expiresAt>Date.now()+60000) return a.access;
    if (!this.locks.has(id)) this.locks.set(id,(async()=>{
      const token=await remoteJSON(TOKEN,{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:a.client,refresh_token:a.refresh,resource:RESOURCE})});
      if (!token.access_token) throw new Error('No se pudo renovar el acceso.');
      a.access=token.access_token; a.refresh=token.refresh_token || a.refresh; a.expiresAt=Date.now()+Number(token.expires_in||3600)*1000; if(token.id_token) a.idToken=token.id_token;
      await this.save(); return a.access;
    })().finally(()=>this.locks.delete(id)));
    return this.locks.get(id);
  }
  async models(id=this.selected().id) {
    const d=await remoteJSON(`${RESOURCE}/models`,{headers:{Authorization:`Bearer ${await this.access(id)}`}});
    if (!Array.isArray(d.models)) throw new Error('El catálogo OAuth no tiene el formato esperado.');
    return d.models.filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name||m.slug,description:m.description||'',reasoning:m.supported_reasoning_levels||[]}));
  }
  async logout(id) {
    const a=this.data.accounts.find(a=>a.id===id); if (!a) throw new Error('Cuenta desconocida.');
    let revoked=false;
    try { const m=await this.discovery(); if (a.refresh && m.revocation_endpoint && new URL(m.revocation_endpoint).origin==='https://auth.openai.com') { const r=await fetch(m.revocation_endpoint,{method:'POST',body:new URLSearchParams({token:a.refresh,token_type_hint:'refresh_token',client_id:a.client}),signal:AbortSignal.timeout(15000)}); revoked=r.ok; } } catch {}
    delete a.access; delete a.refresh; delete a.idToken; delete a.expiresAt;
    if(this.data.selected===id) this.data.selected=null;
    await this.save(); return {revoked,message:revoked?'Permiso revocado y credenciales eliminadas.':'Credenciales locales eliminadas. No se pudo confirmar la revocación remota; revisa tus aplicaciones en ChatGPT.'};
  }
}
