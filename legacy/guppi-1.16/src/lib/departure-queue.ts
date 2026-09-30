import {pause,type Command} from './engine';
import {api,probeGet,manniesGet,aboardReady} from './workshop';
import {coordKey,isCoord,type Coord} from './navigation';
import type {CraftJob} from './construction-queue';
import {departureCrew,type LeaveCrew} from './remote-mining';
export async function waitForDeparture({probeId,origin,hours,signal,send,jobs,isBusy,report,leaveCrew=[],wait=pause,now=Date.now}:{probeId:string;origin:Coord;hours:number;signal:AbortSignal;send:(c:Command)=>Promise<any>;jobs:()=>CraftJob[];isBusy:()=>boolean;report:(message:string)=>void;leaveCrew?:LeaveCrew[];wait?:(ms:number,s:AbortSignal)=>Promise<void>;now?:()=>number}){
 if(!Number.isFinite(hours)||hours<1||hours>168)throw Error('Departure wait must be 1–168 hours.');
 const end=now()+hours*3600000;
 const check=()=>{if(signal.aborted)throw Error('Departure cancelled.');if(now()>=end)throw Error('Departure wait expired. No travel was launched.');};
 while(true){
  check();
  const pending=jobs().filter(j=>j.probeId===probeId&&j.status!=='done');
  if(pending.some(j=>['blocked','review'].includes(j.status)))throw Error('Construction needs attention. Resolve it before queuing departure again.');
  const p=(await send(api(probeGet)))?.probe;
  check();
  if(String(p?.id)!==probeId||!isCoord(p.sector?.relative)||coordKey(p.sector.relative)!==coordKey(origin)||!['idle','orbiting'].includes(p.status))throw Error('The probe moved or is unavailable. Replot the route before queuing departure.');
  const crew=(await send(api(manniesGet)))?.mannies;
  check();
  if(!Array.isArray(crew))throw Error('Manny status is unavailable. Departure stopped.');
  let away:any[];try{away=departureCrew(crew,leaveCrew);}catch(e){report((e as Error).message);await wait(Math.min(15000,Math.max(1,end-now())),signal);continue;}
  // Recheck after reads: jobs or foreground operations can be added while awaiting telemetry.
  if(!away.length&&!isBusy()&&!jobs().some(j=>j.probeId===probeId&&j.status!=='done'))return;
  report(pending.length?`Waiting for ${pending.length} construction job(s). Start the construction queue if it is paused.`:away.length?`Waiting for ${away.length} Manny(s) to be aboard and idle. Finish or recall their tasks; no automatic recall is sent.`:'Waiting for the current command to finish.');
  await wait(Math.min(15000,Math.max(1,end-now())),signal);
 }
}
