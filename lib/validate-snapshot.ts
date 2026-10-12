import {z} from 'zod';
import {hash} from './lab.ts';

const impression=z.object({id:z.string(),category:z.string().max(100),text:z.string().min(1).max(1500),intensity:z.number().min(0).max(1).nullable()});
const phase=z.object({phase:z.enum(['capture','structure','interpret']),hash:z.string().length(64),at:z.string(),raw:z.string(),data:z.object({impressions:z.array(impression).max(20),relations:z.array(z.string()).max(30),hypotheses:z.array(z.object({text:z.string(),basedOn:z.array(z.string())})).max(15),abstention:z.string().nullable()})});
const session=z.object({id:z.string(),model:z.string(),status:z.enum(['queued','running','completed','abstained','error','cancelled']),phases:z.array(phase).max(3)});
const schema=z.object({id:z.string(),code:z.string(),viewerCode:z.string().uuid().optional(),viewerProtocol:z.string().optional(),config:z.unknown(),protocolHash:z.string(),status:z.enum(['running','sealed','partial','cancelled']),revision:z.number().int().positive(),sessions:z.array(session).min(1).max(24),resultHash:z.string().optional()});
const promptSchema=z.tuple([
 z.object({role:z.literal('developer'),content:z.tuple([z.object({type:z.literal('input_text'),text:z.string()}).strict()])}).strict(),
 z.object({role:z.literal('user'),content:z.tuple([z.object({type:z.literal('input_text'),text:z.string()}).strict()])}).strict()
]);
type Stored={id:string;code:string;config:string;snapshot:string|null};
export async function validateSnapshot(value:unknown,row:Stored){
 const s=schema.parse(value),original=value as Record<string,unknown>,config=JSON.parse(row.config),previous=row.snapshot?JSON.parse(row.snapshot):null;
 if(s.id!==row.id||s.code!==row.code||JSON.stringify(s.config)!==JSON.stringify(config)||s.protocolHash!==await hash(config)||s.sessions.length!==config.agents)throw new Error('400:El registro no coincide con el protocolo fijado.');
 const audited=s.viewerProtocol==='blind-phase-isolation-v3';
 if(audited&&!s.viewerCode)throw new Error('400:Falta el código opaco del visor.');
 if(previous&&(s.viewerCode!==previous.viewerCode||s.viewerProtocol!==previous.viewerProtocol))throw new Error('409:El protocolo y el código de los visores no se pueden cambiar.');
 const stages=config.phases==='capture'?['capture']:['capture','structure','interpret'];
 for(let i=0;i<s.sessions.length;i++){
  const agent=s.sessions[i],id=`v${String(i+1).padStart(2,'0')}`;
  if(agent.id!==id||agent.model!==config.models[i%config.models.length])throw new Error('400:Identidad o modelo de visor inválido.');
  if(agent.phases.some((p,n)=>p.phase!==stages[n]))throw new Error('400:Secuencia de fases inválida.');
  if(agent.status==='completed'&&agent.phases.length!==stages.length)throw new Error('400:Visor incompleto.');
  if(agent.status==='abstained'){
   const data=agent.phases[0]?.data;
   if(config.stopOnEmpty===false||agent.phases.length!==1||!data||data.impressions.length||data.relations.length||data.hypotheses.length)throw new Error('400:La abstención debe conservar una captura vacía.');
  }
  const rawAgent=(original.sessions as {phases:Record<string,unknown>[]}[])[i];
  for(let n=0;n<agent.phases.length;n++){
   const {hash:storedHash,...record}=rawAgent.phases[n];
   if(storedHash!==await hash(record))throw new Error('400:El hash de una fase no coincide.');
   if(audited){
    const prompt=promptSchema.parse(record.prompt);
    if(record.promptHash!==await hash(prompt))throw new Error('400:El hash del prompt no coincide.');
    const input=JSON.parse(prompt[1].content[0].text),stage=agent.phases[n].phase,data=agent.phases[n].data;
    if(input.targetCode!==s.viewerCode||input.phase!==stage)throw new Error('400:El prompt no coincide con el código o la fase.');
    const keys=config.viewerGuidance==='custom'?['targetCode','phase','ownSealedPhases','optionalGuidance']:['targetCode','phase','ownSealedPhases'];
    if(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(keys.sort()))throw new Error('400:El prompt contiene campos no autorizados.');
    const own=agent.phases.slice(0,n).map(p=>({phase:p.phase,data:{impressions:p.data.impressions,relations:p.data.relations}}));
    if(JSON.stringify(input.ownSealedPhases)!==JSON.stringify(own))throw new Error('400:El contexto debe contener sólo las fases propias.');
    if(config.viewerGuidance==='custom'&&JSON.stringify(input.optionalGuidance)!==JSON.stringify({categories:config.categories,instructions:config.instructions}))throw new Error('400:Las orientaciones no coinciden con el protocolo fijado.');
    if((stage==='capture'&&(data.relations.length||data.hypotheses.length))||(stage==='structure'&&(data.impressions.length||data.hypotheses.length))||(stage==='interpret'&&(data.impressions.length||data.relations.length)))throw new Error('400:Contenido fuera de su fase.');
    const ownIds=new Set(own.flatMap(p=>p.data.impressions.map(c=>c.id)));
    if(data.hypotheses.some(h=>!h.basedOn.length||h.basedOn.some(id=>!ownIds.has(id))))throw new Error('400:Hipótesis sin referencias propias.');
   }
   if(agent.phases[n].data.impressions.some((c,k)=>c.id!==`${id}-${stages[n]}-${k+1}`))throw new Error('400:Identificador de impresión inválido.');
  }
  const prior=previous?.sessions[i];
  if(prior){for(let n=0;n<prior.phases.length;n++)if(JSON.stringify(prior.phases[n])!==JSON.stringify(rawAgent.phases[n]))throw new Error('409:Una fase sellada no se puede reescribir.');}
 }
 if(s.status!=='running'&&s.sessions.some(a=>['queued','running'].includes(a.status)))throw new Error('400:No se puede cerrar un registro con visores activos.');
 if(s.status==='sealed'&&s.sessions.some(a=>!['completed','abstained'].includes(a.status)))throw new Error('400:El registro contiene visores incompletos.');
 if(s.status!=='running'&&s.resultHash&&s.resultHash!==await hash(original.sessions))throw new Error('400:El hash final no coincide.');
 return {snapshot:value,stale:!!previous&&s.revision<=previous.revision,status:s.status};
}
