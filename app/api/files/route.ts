import {env} from 'cloudflare:workers';
import {getDb} from '@/db';
import {files,runs} from '@/db/schema';
import {and,eq} from 'drizzle-orm';
import {identity,json,failure,getRun,event} from '@/lib/server';
import {isClosed} from '@/lib/lab';

export async function POST(req:Request){try{
 const u=await identity(req);
 if(Number(req.headers.get('Content-Length')||0)>11*1024*1024)throw new Error('413:El archivo supera el límite.');
 const data=await req.formData(),file=data.get('file'),runId=String(data.get('runId')),purpose=String(data.get('purpose'));
 const r=await getRun(runId,u.userId);
 if(!(file instanceof File)||file.size>10*1024*1024||file.size===0)throw new Error('400:Adjunta un archivo de hasta 10 MB.');
 if(!['image/png','image/jpeg','image/webp','application/pdf','text/plain','audio/mpeg','audio/wav','audio/mp4'].includes(file.type))throw new Error('400:Formato no admitido.');
 if(purpose==='target'){if(r.mode!=='sealed'||r.status!=='draft')throw new Error('409:El objetivo ya está cerrado.');}
 else if(purpose!=='feedback'||!isClosed(r.status))throw new Error('409:El feedback requiere sesiones cerradas.');
 const prior=await getDb().select({id:files.id}).from(files).where(and(eq(files.runId,runId),eq(files.owner,u.userId),eq(files.purpose,purpose)));
 if(prior.length>=10)throw new Error('400:Máximo 10 archivos por referencia o feedback.');
 const id=crypto.randomUUID();
 await env.BUCKET!.put(`${u.userId}/${id}`,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
 await getDb().insert(files).values({id,owner:u.userId,runId,purpose,name:file.name.slice(0,200),type:file.type,size:file.size,createdAt:new Date().toISOString()});
 if(purpose==='feedback')await getDb().update(runs).set({evaluation:null,updatedAt:new Date().toISOString()}).where(and(eq(runs.id,runId),eq(runs.owner,u.userId)));
 await event(u.userId,runId,'attachment',{id,purpose,name:file.name});return json({id,name:file.name,type:file.type});
}catch(e){return failure(e);}}
