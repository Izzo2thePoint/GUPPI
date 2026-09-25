import {coordKey,isCoord,type Coord} from './navigation';
import {mergeSystem,type ArchiveProfile,type ArchivedSystem} from './system-archive';
import {api,probeGet,manniesGet,sectorGet,aboardReady} from './workshop';
import type {Command} from './engine';

export type FleetProbe={id:string;listed:any;listedAt:number;probe?:any;probeAt?:number;crew?:any[];crewAt?:number;errors:Record<string,string>};
export type FleetState={roster:string[];entries:Record<string,FleetProbe>;listedAt:number};
export type FleetSystem=ArchivedSystem&{sources:string[];names:string[]};
export const emptyFleet=():FleetState=>({roster:[],entries:{},listedAt:0});
export const moving=(p:any)=>['preparing','accelerating','cruising','decelerating'].includes(p?.status);
const text=(v:any)=>typeof v==='string'?v.slice(0,500):undefined;
const finite=(v:any)=>Number.isFinite(v)?v:undefined;
const coord=(v:any)=>isCoord(v)?{x:v.x,y:v.y,z:v.z}:undefined;
const validManny=(v:any)=>!!v&&typeof v==='object'&&(typeof v.id==='string'&&v.id.length>0||typeof v.id==='number'&&Number.isSafeInteger(v.id));
const validRoster=(v:any):v is any[]=>Array.isArray(v)&&v.every(p=>p&&/^\d+$/.test(String(p.id)));
/** Keep only overview telemetry; never retain authentication, inventory contents, or messages. */
export function compactProbe(p:any){return {id:String(p.id),name:text(p.name),status:text(p.status),isReachable:typeof p.isReachable==='boolean'?p.isReachable:undefined,sector:{relative:coord(p.sector?.relative)},systems:{integrityPercent:finite(p.systems?.integrityPercent)},fuel:{deuterium:finite(p.fuel?.deuterium)},inventory:{capacity:finite(p.inventory?.capacity),usedCapacity:finite(p.inventory?.usedCapacity),freeCapacity:finite(p.inventory?.freeCapacity)},movement:p.movement?{status:text(p.movement.status),origin:coord(p.movement.origin),target:coord(p.movement.target),arrivalAt:text(p.movement.arrivalAt),secondsRemaining:finite(p.movement.secondsRemaining),estimatedVelocityC:finite(p.movement.estimatedVelocityC)}:null};}
export function compactManny(m:any){return {id:String(m.id),name:text(m.name),currentTask:m.currentTask===null?null:text(m.currentTask),canReceiveOrders:m.canReceiveOrders===true,location:{type:text(m.location?.type),sector:{relative:coord(m.location?.sector?.relative)}},taskProgressPercent:finite(m.taskProgressPercent)};}
const compactListing=(p:any)=>({id:String(p.id),name:text(p.name),status:text(p.status),isReachable:typeof p.isReachable==='boolean'?p.isReachable:undefined,sector:{relative:coord(p.sector?.relative)}});
export function fleetRecord(old:FleetState,id:string,operation:string,data:any,now=Date.now()):FleetState{
 if(operation==='GET /api/probes'){
  const list=Array.isArray(data)?data:data?.probes;if(!validRoster(list))return old;
  const roster=[...new Set(list.map(p=>String(p.id)))],entries={...old.entries};
  for(const p of list){const id=String(p.id);entries[id]={...entries[id],id,listed:compactListing(p),listedAt:now,errors:entries[id]?.errors||{}};}
  return {roster,entries:Object.fromEntries(roster.map(id=>[id,entries[id]])),listedAt:now};
 }
 if(!old.roster.includes(id))return old;
 const e=old.entries[id],next={...e,errors:{...e.errors}};
 if(operation===probeGet&&String(data?.probe?.id)===id){next.probe=compactProbe(data.probe);next.probeAt=now;delete next.errors.probe;}
 else if(operation===manniesGet&&Array.isArray(data?.mannies)&&data.mannies.every(validManny)){next.crew=data.mannies.map(compactManny);next.crewAt=now;delete next.errors.crew;}
 else if(validManny(data?.manny)&&e.crew){const updates=[data.manny,...(Array.isArray(data.results)?data.results:[]).map((r:any)=>r?.manny)].filter(validManny),crew=new Map(e.crew.map(m=>[m.id,m]));for(const m of updates)crew.set(String(m.id),compactManny(m));next.crew=[...crew.values()];/* A single acceptance does not refresh the rest of the crew. */}
 else if(Array.isArray(data?.results)&&e.crew){const crew=new Map(e.crew.map(m=>[m.id,m]));for(const r of data.results)if(validManny(r?.manny))crew.set(String(r.manny.id),compactManny(r.manny));next.crew=[...crew.values()];}
 else if(operation===sectorGet&&data?.sector){delete next.errors.sensors;}
 else if(operation==='GET /api/probe/{probeId}/visited-sectors'&&Array.isArray(data?.visitedSectors)){delete next.errors.history;}
 else return old;
 return {...old,entries:{...old.entries,[id]:next}};
}
export function fleetData(e:FleetProbe){const p=e.probe||e.listed;if(e.listedAt>(e.probeAt||0)){return {...p,...Object.fromEntries(Object.entries(e.listed).filter(([k,v])=>v!==undefined&&k!=='sector')),sector:isCoord(e.listed.sector?.relative)?e.listed.sector:p.sector,movement:moving(e.listed)?p.movement:null};}return p;}
export function fleetContact(e:FleetProbe){const p=fleetData(e);return p?.status!=='out_of_scut_range'&&p?.isReachable!==false&&!e.errors.probe;}
export function crewSummary(e:FleetProbe){if(!e.crew)return null;const available=e.crew.filter(aboardReady).length,unknown=e.crew.filter(m=>m.currentTask===undefined||m.currentTask==='unknown_too_far').length;return {total:e.crew.length,available,busy:e.crew.filter(m=>m.currentTask&&m.currentTask!=='unknown_too_far').length,away:e.crew.filter(m=>m.location?.type!=='probe').length,unknown};}
export function combineFleetSystems(profiles:Record<string,ArchiveProfile>,ids:string[]):FleetSystem[]{
 const merged=new Map<string,FleetSystem>();
 for(const id of ids)for(const r of profiles[id]?.systems||[]){if(!isCoord(r.coord))continue;const key=coordKey(r.coord),old=merged.get(key),name=r.bookmark?.name?.trim(),bookmark=!old?.bookmark||r.bookmark&&(r.bookmark.updatedAt||0)>(old.bookmark.updatedAt||0)?r.bookmark:old.bookmark;
  merged.set(key,{...mergeSystem(old,r),bookmark,sources:[...new Set([...(old?.sources||[]),id])],names:[...new Set([...(old?.names||[]),...(name?[name]:[])])]});
 }
 return [...merged.values()];
}
export function restoreFleet(raw:string):FleetState{
 const v=JSON.parse(raw);if(!v||!Array.isArray(v.roster)||v.roster.length>10000||!v.entries)throw Error('Invalid saved fleet');const result=emptyFleet();result.listedAt=Number(v.listedAt)||0;
 for(const id of v.roster){const e=v.entries[id];if(typeof id!=='string'||!/^\d+$/.test(id)||!e||String(e.listed?.id)!==id)throw Error('Invalid saved probe');result.roster.push(id);result.entries[id]={id,listed:compactListing(e.listed),listedAt:Number(e.listedAt)||0,probe:e.probe?compactProbe(e.probe):undefined,probeAt:Number(e.probeAt)||0,crew:Array.isArray(e.crew)?e.crew.map(compactManny):undefined,crewAt:Number(e.crewAt)||0,errors:{}};}
 return result;
}
/** Read probes one at a time through the existing rate-limited request queue. A missing sensor never blocks the rest of the fleet. */
export async function refreshFleet({send,signal,history,progress,onError}:{send:(c:Command,id:string,signal:AbortSignal)=>Promise<any>;signal:AbortSignal;history:Set<string>;progress:(s:string)=>void;onError:(id:string,channel:string,message:string)=>void}){
 const check=()=>{if(signal.aborted)throw Error('Stopped');};check();const data=await send(api('GET /api/probes'),'',signal),list=Array.isArray(data)?data:data?.probes;if(!validRoster(list))throw Error('The game did not return a valid probe list.');
 for(let i=0;i<list.length;i++){check();const id=String(list[i].id);progress(`Updating ${list[i].name||'Probe '+id} · ${i+1} / ${list.length}`);let p:any;
   const read=async(operation:string,channel:string)=>{check();try{const r=await send(api(operation),id,signal);const field=({probe:'probe',crew:'mannies',sensors:'sector',history:'visitedSectors'} as Record<string,string>)[channel];if(!r?.[field]||channel==='crew'&&(!Array.isArray(r.mannies)||!r.mannies.every(validManny))||channel==='history'&&!Array.isArray(r.visitedSectors)||channel==='sensors'&&(typeof r.sector!=='object'||Array.isArray(r.sector)))throw Error('Incomplete '+channel+' response');return r}catch(e){check();if((e as any).status===401)throw e;onError(id,channel,(e as Error).message);return null;}};
  p=(await read(probeGet,'probe'))?.probe;if(!p||String(p.id)!==id){if(p)onError(id,'probe','The returned probe did not match.');continue;}if(p.status==='out_of_scut_range'||p.isReachable===false||['dead','destroyed'].includes(p.status))continue;
  await read(manniesGet,'crew');if(['idle','orbiting'].includes(p.status))await read(sectorGet,'sensors');
  if(!history.has(id)){const h=await read('GET /api/probe/{probeId}/visited-sectors','history');if(Array.isArray(h?.visitedSectors))history.add(id);}
 }
 check();progress('Fleet refresh complete');
}
