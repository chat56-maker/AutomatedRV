// Only the random window channel and loopback origin are kept across a reload.
// Account status and OAuth credentials are never restored from browser storage.
export const bridgeSessionKey='limen:bridge-session:v1';
export type BridgeSession={origin:string;channel:string};
type StorageAccess=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readBridgeSession(storage:StorageAccess):BridgeSession|null{
 try{
  const value=JSON.parse(storage.getItem(bridgeSessionKey)||'null');
  if(!value||typeof value.origin!=='string'||typeof value.channel!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.channel))return null;
  const url=new URL(value.origin),port=Number(url.port);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.origin!==value.origin||url.username||url.password||!Number.isInteger(port)||port<1024||port>65535)return null;
  return {origin:value.origin,channel:value.channel};
 }catch{return null;}
}
export function saveBridgeSession(storage:StorageAccess,session:BridgeSession){try{storage.setItem(bridgeSessionKey,JSON.stringify({origin:session.origin,channel:session.channel}));}catch{/* Private browsing can disable storage. Manual linking still works. */}}
export function clearBridgeSession(storage:StorageAccess){try{storage.removeItem(bridgeSessionKey);}catch{}}
export function acceptsBridgeMessage(event:MessageEvent,session:BridgeSession,popup:Window|null,restoring:boolean){
 if(!session.channel||event.origin!==session.origin||event.data?.channel!==session.channel||!event.source)return false;
 if(popup)return event.source===popup;
 return restoring&&event.data.type==='limen:ready'&&typeof (event.source as Window).postMessage==='function';
}
