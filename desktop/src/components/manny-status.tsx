'use client';
import {useEffect,useState} from 'react';
import {Progress} from '@/components/ui/progress';
import {resourceName} from '@/lib/mining';
import type {MannyRecord} from '@/lib/manny-telemetry';
const label=(s:string)=>s.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function MannyStatus({manny:m}:{manny:MannyRecord}){
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{setNow(Date.now());if(!m.currentTask)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[m.currentTask,m.taskEstimatedEndTime]);
 const unknown=m.taskVisibility==='too_far'||m.currentTask==='unknown_too_far';
 const task=unknown?'Telemetry unavailable':m.currentTask?(m.currentTask==='moving_stockage'?'Moving inventory':label(m.currentTask)):m.canReceiveOrders?'Available':'Idle';
 const end=Date.parse(m.taskEstimatedEndTime||'');const seconds=Number.isFinite(end)?Math.max(0,Math.ceil((end-now)/1000)):null;
 const eta=seconds===null?'ETA unavailable':seconds===0?'Due · awaiting status update':`${Math.floor(seconds/3600)?Math.floor(seconds/3600)+'h ':''}${Math.floor(seconds%3600/60)}m ${String(seconds%60).padStart(2,'0')}s left`;
 const progress=typeof m.taskProgressPercent==='number'&&Number.isFinite(m.taskProgressPercent)?Math.min(100,Math.max(0,m.taskProgressPercent)):null;
 const resources=Array.isArray(m.task?.resourceTypes)?m.task.resourceTypes:[];
 return <><div className="row between"><h3>{m.name||m.id}</h3><span className={'badge '+(!m.currentTask&&m.canReceiveOrders?'online':'')}>{task}</span></div><p className="manny-location">{m.location?.type==='probe'?'Aboard probe':m.location?.type==='sector'?'Outside in sector':'Location unavailable'}{m.location?.sector?.relative?' · '+Object.values(m.location.sector.relative).join(', '):''}</p>
 {unknown?<p className="hint">Outside telemetry range. Current task details cannot be confirmed.</p>:m.currentTask&&<><div className="row between manny-progress"><span>{progress===null?'Progress unavailable':`${Math.round(progress)}% complete`}</span><span>{eta}</span></div>{progress!==null&&<Progress value={progress} aria-label={`${m.name||m.id} task progress`}/>}{m.currentTask==='mining'&&<p className="manny-detail">{resources.map(resourceName).join(', ')||'Mining'}{typeof m.task?.targetAmount==='number'?' · '+m.task.targetAmount+' ECE':''}{m.task?.target?.name?' · '+m.task.target.name:''}</p>}</>}
 </>;
}

