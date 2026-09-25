'use client';
import {useEffect,useState} from 'react';
type Movement={status?:string;arrivalAt?:string;secondsRemaining?:number};
export function ProbeCountdown({status,movement}:{status?:string;movement?:Movement|null}){
 const [remaining,setRemaining]=useState<number|null>(null);
 const active=['preparing','accelerating','cruising','decelerating'].includes(status||'')&&!['arrived','failed','destroyed'].includes(movement?.status||'');
 useEffect(()=>{if(!active){setRemaining(null);return;}const arrival=Date.parse(movement?.arrivalAt||'');const seconds=movement?.secondsRemaining;const deadline=Number.isFinite(arrival)?arrival:typeof seconds==='number'&&Number.isFinite(seconds)?Date.now()+Math.max(0,seconds)*1000:null;if(deadline===null){setRemaining(null);return;}const tick=()=>setRemaining(Math.max(0,Math.ceil((deadline-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[active,movement]);
 let text='No active travel';if(active){if(remaining===null)text='ETA unavailable';else if(remaining===0)text='Due · refresh state';else{const d=Math.floor(remaining/86400),h=Math.floor(remaining%86400/3600),m=Math.floor(remaining%3600/60),s=remaining%60;text=(d?`${d}d `:'')+(h||d?`${h}h `:'')+`${m}m ${String(s).padStart(2,'0')}s left`;}}
 return <small className="probe-countdown" title={active?'Estimated time until arrival, based on the last game response. Refresh to confirm the latest probe state.':'No active movement reported.'}>{text}</small>;
}
