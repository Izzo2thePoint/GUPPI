'use client';
import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import type {Command} from '@/lib/engine';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
export type ReadGame=(command:Command,signal:AbortSignal)=>Promise<any>;
export type ActGame=(command:Command)=>Promise<any>;
export function useLiveData(active:boolean,load:(signal:AbortSignal)=>Promise<any>,identity='',background=false){
 const latest=useRef(load);latest.current=load;
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[updated,setUpdated]=useState<number|null>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{setData(null);setError('');setUpdated(null)},[identity]);
 useEffect(()=>{if(!active){setLoading(false);return;}const abort=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,inFlight=false;
  const tick=async()=>{if(abort.signal.aborted||inFlight)return;clearTimeout(timer);if(document.hidden&&!background){timer=setTimeout(tick,15000);return;}inFlight=true;setLoading(true);let delay=15000;
   try{const result=await latest.current(abort.signal);if(!abort.signal.aborted){setData(result);setUpdated(Date.now());setError(result?.loadWarning||'');const hint=Number(result?.nextUsefulRefreshDelayMs);if(Number.isFinite(hint)&&hint>0)delay=Math.max(15000,Math.min(hint,60000));if(result?.loadWarning)delay=60000;}}
   catch(e){if(!abort.signal.aborted){setError(e instanceof Error?e.message:String(e));delay=60000;}}
   finally{inFlight=false;if(!abort.signal.aborted){setLoading(false);timer=setTimeout(tick,delay);}}
  };const visible=()=>{if(!document.hidden)void tick()};document.addEventListener('visibilitychange',visible);void tick();return()=>{abort.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visible)};
 },[active,identity,revision,background]);
 return {data,error,loading,updated,refresh:()=>setRevision(n=>n+1)};
}
export function LiveStatus({state,connected}:{state:ReturnType<typeof useLiveData>;connected:boolean}){return <div className="live-status"><span>{!connected?'Connect your probe to load live data.':state.loading?'Refreshing…':state.updated?`Updated ${new Date(state.updated).toLocaleTimeString()} · auto refresh`:'Waiting for data…'}</span><button className="small" disabled={!connected||state.loading} onClick={state.refresh}><RefreshCw size={14}/> Refresh</button>{state.error&&<p className="error" role="alert">{state.error}{state.data?' Showing the last received data.':''}</p>}</div>}
export function GameSelect({value,onChange,options,label,disabled=false}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];label:string;disabled?:boolean}){return <Select value={value} onValueChange={v=>v!==null&&onChange(v)} disabled={disabled}><SelectTrigger aria-label={label} className="choice"><SelectValue>{options.find(o=>o.value===value)?.label||'Choose…'}</SelectValue></SelectTrigger><SelectContent>{options.map(o=><SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}
