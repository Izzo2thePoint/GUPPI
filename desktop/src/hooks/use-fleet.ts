import {useCallback,useEffect,useRef,useState} from 'react';
import {emptyFleet,fleetRecord,refreshFleet,restoreFleet,type FleetState} from '@/lib/fleet';
import type {Command} from '@/lib/engine';
const storage='guppi-fleet-overview-v1';
export function useFleet(connected:boolean,active:boolean,send:(c:Command,id:string,signal:AbortSignal)=>Promise<any>){
 const [data,setData]=useState<FleetState>(()=>{try{return restoreFleet(localStorage.getItem(storage)||'null')}catch{return emptyFleet()}}),[loading,setLoading]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[storageError,setStorageError]=useState(''),[revision,setRevision]=useState(0),[updated,setUpdated]=useState(0);
 const state=useRef(data),latest=useRef(send),history=useRef(new Set<string>());latest.current=send;
 const commit=useCallback((next:FleetState)=>{if(next===state.current)return;state.current=next;setData(next);try{localStorage.setItem(storage,JSON.stringify(next));setStorageError('')}catch{setStorageError('Fleet snapshot could not be saved. Current readings remain available for this session.')}},[]);
 const record=useCallback((id:string,operation:string,result:any)=>commit(fleetRecord(state.current,id,operation,result)),[commit]);
 useEffect(()=>{if(!connected)history.current.clear()},[connected]);
 useEffect(()=>{
  if(!connected||!active){setLoading(false);return;}const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{if(controller.signal.aborted)return;setLoading(true);setError('');try{await refreshFleet({signal:controller.signal,history:history.current,send:(...args)=>latest.current(...args),progress:s=>{if(!controller.signal.aborted)setProgress(s)},onError:(id,channel,message)=>{const e=state.current.entries[id];if(e)commit({...state.current,entries:{...state.current.entries,[id]:{...e,errors:{...e.errors,[channel]:message}}}})}});if(!controller.signal.aborted)setUpdated(Date.now())}catch(e){if(!controller.signal.aborted)setError((e as Error).message)}finally{if(!controller.signal.aborted){setLoading(false);timer=setTimeout(tick,60000)}}};
  void tick();return()=>{controller.abort();clearTimeout(timer)};
 },[connected,active,revision,commit]);
 return {data,record,loading,progress,error,storageError,updated,refresh:()=>{history.current.clear();setRevision(v=>v+1)}};
}
