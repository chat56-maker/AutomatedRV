'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ConnectorState,Model} from './types';
import {readBridgeSession,saveBridgeSession,clearBridgeSession,acceptsBridgeMessage} from './bridge-session';
export function useBridge(){
  const popup=useRef<Window|null>(null),channel=useRef(''),origin=useRef('http://127.0.0.1:1455');
  const restoring=useRef(false),openingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pending=useRef(new Map<string,{resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
  const [state,setState]=useState<ConnectorState|null>(null),[models,setModels]=useState<Model[]>([]),[error,setError]=useState(''),[opening,setOpening]=useState(false);
  const [savedPort,setSavedPort]=useState(1455);
  const request=useCallback(<T,>(method:string,payload:unknown={}):Promise<T>=>new Promise((resolve,reject)=>{
    if(!popup.current||popup.current.closed)return reject(new Error('Abre el conector local para continuar.'));
    const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.current.delete(id);reject(new Error('El conector no respondió. Comprueba que la terminal y su ventana siguen abiertas.'));},45000);
    pending.current.set(id,{resolve:v=>resolve(v as T),reject,timer});popup.current.postMessage({type:'limen:request',channel:channel.current,id,method,payload},origin.current);
  }),[]);
  useEffect(()=>{
    if(!channel.current){try{const saved=readBridgeSession(window.sessionStorage);if(saved){origin.current=saved.origin;channel.current=saved.channel;restoring.current=true;setSavedPort(Number(new URL(saved.origin).port));}}catch{/* Storage unavailable: reconnect by clicking. */}}
    if(restoring.current){setOpening(true);openingTimer.current=setTimeout(()=>setOpening(false),15000);}
    const handler=(event:MessageEvent)=>{if(!acceptsBridgeMessage(event,{origin:origin.current,channel:channel.current},popup.current,restoring.current))return;
      if(event.data.type==='limen:ready'){if(!popup.current)popup.current=event.source as Window;restoring.current=false;if(openingTimer.current)clearTimeout(openingTimer.current);setState(event.data.status);setOpening(false);setError('');}
      if(event.data.type==='limen:response'){const p=pending.current.get(event.data.id);if(p){clearTimeout(p.timer);pending.current.delete(event.data.id);if(event.data.error)p.reject(new Error(event.data.error));else p.resolve(event.data.result);}}
    };window.addEventListener('message',handler);
    const interval=setInterval(()=>{if(popup.current?.closed){popup.current=null;restoring.current=false;channel.current='';try{clearBridgeSession(window.sessionStorage);}catch{}setState(null);setOpening(false);setModels([]);}},1500);
    const requests=pending.current;
    return()=>{window.removeEventListener('message',handler);clearInterval(interval);if(openingTimer.current)clearTimeout(openingTimer.current);for(const p of requests.values()){clearTimeout(p.timer);p.reject(new Error('Conexión cerrada.'));}requests.clear();};
  },[]);
  const refreshModels=useCallback(async()=>{try{const data=await request<Model[]>('models');setModels(data);setError('');}catch(e){setModels([]);setError((e as Error).message);}},[request]);
  const selected=state?.selected;
  useEffect(()=>{if(selected)void refreshModels();else setModels([]);},[selected,refreshModels]);
  const connect=(port=1455)=>{
    if(!Number.isInteger(port)||port<1024||port>65535){setError('Puerto local inválido.');return;}
    if(openingTimer.current)clearTimeout(openingTimer.current);
    for(const p of pending.current.values()){clearTimeout(p.timer);p.reject(new Error('El enlace con el conector se está renovando.'));}pending.current.clear();
    origin.current=`http://127.0.0.1:${port}`;channel.current=crypto.randomUUID();restoring.current=false;setSavedPort(port);setState(null);setModels([]);setOpening(true);setError('');
    popup.current=window.open(`${origin.current}/?channel=${channel.current}`,'limen-connector','width=650,height=740');
    if(!popup.current){try{clearBridgeSession(window.sessionStorage);}catch{}setOpening(false);setError('Permite ventanas emergentes para abrir el conector.');}
    else {try{saveBridgeSession(window.sessionStorage,{origin:origin.current,channel:channel.current});}catch{}openingTimer.current=setTimeout(()=>setOpening(false),15000);}
  };
  return {state,models,error,opening,savedPort,request,connect,refreshModels,connected:!!state?.selected};
}
