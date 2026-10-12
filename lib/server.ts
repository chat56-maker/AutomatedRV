import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import { runs, events, files } from '@/db/schema';
import {hash} from '@/lib/lab';
import { and,eq } from 'drizzle-orm';
export const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function identity(req?:Request){const u=await getChatGPTUser();if(!u)throw new Error('401:Inicia sesión con ChatGPT.');if(req&&req.method!=='GET'){const origin=req.headers.get('origin');if(!origin||origin!==new URL(req.url).origin)throw new Error('403:Origen no autorizado.');}return u;}
export async function getRun(id:string,owner:string){const row=await getDb().select().from(runs).where(and(eq(runs.id,id),eq(runs.owner,owner))).get();if(!row)throw new Error('404:Sesión no encontrada.');return row;}
export async function event(owner:string,runId:string,type:string,data:unknown={}){await getDb().insert(events).values({id:crypto.randomUUID(),owner,runId,type,data:JSON.stringify(data),createdAt:new Date().toISOString()});}
export async function evidenceVersion(row:typeof runs.$inferSelect){const attachments=await getDb().select({id:files.id}).from(files).where(and(eq(files.runId,row.id),eq(files.owner,row.owner)));return hash({target:row.privateTarget,feedback:row.feedback,files:attachments.map(f=>f.id).sort()});}
export function failure(e:unknown){const m=e instanceof Error?e.message:'Error inesperado';const match=m.match(/^(\d{3}):(.*)$/s);return json({error:match?match[2]:m.slice(0,400)},match?Number(match[1]):400);}
export async function body(req:Request){const text=await req.text();if(text.length>6_000_000)throw new Error('413:El registro supera el límite.');return JSON.parse(text);}
