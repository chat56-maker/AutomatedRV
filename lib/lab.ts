import { z } from 'zod';
export const categories=['Visual y forma','Sonido y ritmo','Textura y contacto','Temperatura','Olor','Sabor','Movimiento','Espacio y escala','Sensación corporal','Emoción y atmósfera','Asociaciones','Otra impresión'];
export const configSchema=z.object({
 models:z.array(z.string().min(1).max(100)).min(1).max(6), agents:z.number().int().min(1).max(24), concurrency:z.number().int().min(1).max(8),
 phases:z.enum(['capture','structured']), reasoning:z.enum(['default','low','medium','high']), maxTokens:z.number().int().min(500).max(8000),
 timeout:z.number().int().min(30).max(600), categories:z.array(z.string().min(1).max(70)).max(30),
 instructions:z.string().max(4000), judgeModel:z.string().max(100), judges:z.number().int().min(1).max(3),
});
export type Config=z.infer<typeof configSchema>;
export const initialConfig:Config={models:[],agents:6,concurrency:3,phases:'structured',reasoning:'default',maxTokens:1800,timeout:180,categories,instructions:'Describe el referente asociado al código. Registra impresiones y relaciones sin forzar una identidad. Puedes abstenerte o dejar categorías vacías.',judgeModel:'',judges:2};
export const isClosed=(status:string)=>['sealed','partial','cancelled'].includes(status);
export function publicRun(row:any){const {owner,privateTarget,...rest}=row;return {...rest,config:JSON.parse(row.config),snapshot:row.snapshot?JSON.parse(row.snapshot):null,feedback:row.feedback?JSON.parse(row.feedback):null,evaluation:row.evaluation?JSON.parse(row.evaluation):null,hasTarget:!!privateTarget};}
export async function hash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
