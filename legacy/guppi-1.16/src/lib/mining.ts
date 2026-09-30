import type {Routine,Step} from './engine';
export type MiningTarget={id:string;name:string;resourceTypes:string[];resourceAmounts?:Record<string,number>};
export type MiningManny={id:string;name?:string;canReceiveOrders?:boolean;currentTask?:unknown;location?:{type?:string};cargo?:{capacity?:number}};
export const resourceName=(s:string)=>({deuterium:'Deuterium',metals:'Metals',ice:'Ice',carbon_compounds:'Carbon compounds'}[s]||s);
export function miningTargets(response:any):MiningTarget[]{const result=new Map<string,MiningTarget>();const add=(o:any,nested=false)=>{if(typeof o?.id!=='string'||!Array.isArray(o.resourceTypes)||!o.resourceTypes.length||o.mannyMineable===false||o.estimated===true||o.inTransit===true)return;if(!nested&&o.mannyMineable!==true)return;const resources=o.resourceTypes.filter((r:string)=>['deuterium','metals','ice','carbon_compounds'].includes(r)&&!(typeof o.resourceAmounts?.[r]==='number'&&o.resourceAmounts[r]<=0));if(resources.length)result.set(o.id,{id:o.id,name:o.name||o.id,resourceTypes:resources,resourceAmounts:o.resourceAmounts});};for(const o of response?.sector?.objects||[]){add(o);for(const t of o.minableTargets||[])add(t,true);}return [...result.values()];}
export const readyMannies=(mannies:MiningManny[])=>mannies.filter(m=>m.canReceiveOrders===true&&m.currentTask===null&&m.location?.type==='probe');
export function splitAmount(total:number,count:number){if(!Number.isInteger(count)||count<1||count>1000)throw Error('Choose between 1 and 1000 Mannys.');const units=Math.round(total*1e6);if(!Number.isFinite(total)||!Number.isSafeInteger(units)||total<=0||Math.abs(units/1e6-total)>1e-10)throw Error('Enter a positive amount with up to six decimal places.');if(units<count)throw Error('Amount must allow at least 0.000001 ECE per Manny.');const base=Math.floor(units/count),remainder=units%count;return Array.from({length:count},(_,i)=>(base+(i<remainder?1:0))/1e6);}
export function miningLoads(total:number,count:number,mannies:MiningManny[],maxCargo:number){
 const amounts=splitAmount(total,count),crew=readyMannies(mannies).slice(0,count);
 if(crew.length!==count)throw Error(`Only ${crew.length} onboard Mannys are available.`);
 const requested=Math.floor(maxCargo*1e6+1e-8);
 if(!Number.isFinite(maxCargo)||!Number.isSafeInteger(requested)||requested<1)throw Error('Enter a cargo limit of at least 0.000001 ECE per Manny per cycle.');
 const loads=crew.map((m,i)=>{
  const reported=m.cargo?.capacity,capacity=reported === undefined ? .05 : reported;
  if(!Number.isFinite(capacity)||capacity<=0)throw Error('A selected Manny has no usable cargo capacity. Refresh Manny status.');
  const cap=Math.min(requested,Math.floor(capacity*1e6+1e-8)),units=Math.round(amounts[i]*1e6);
  if(cap<1)throw Error('Manny capacity is below the planner’s precision.');
  const trips=Math.ceil(units/cap);if(trips>1000)throw Error('Choose a larger cargo limit or smaller total: a plan supports up to 1,000 cycles per Manny.');
  return {manny:m,total:amounts[i],capacity:cap/1e6,reportedCapacity:capacity,assumed:reported===undefined,trips,amounts:Array.from({length:trips},(_,j)=>Math.min(cap,units-j*cap)/1e6)};
 });
 if(loads.reduce((n,l)=>n+l.trips,0)>10000)throw Error('A plan supports up to 10,000 total loads. Reduce the amount or increase the cargo limit.');
 return {loads,cycles:Math.max(...loads.map(l=>l.trips)),trips:loads.reduce((n,l)=>n+l.trips,0)};
}
export function createMiningRoutine(target:MiningTarget|undefined,resource:string,total:number,count:number,mannies:MiningManny[],probeId:string,destination?:{id:string;mode?:string;targetObjectId?:string},maxCargo=.05):Routine{
 if(destination&&(!destination.id||resource==='deuterium'))throw Error('Detached containers cannot receive deuterium. Choose probe storage.');
 if(!target||!target.resourceTypes.includes(resource))throw Error('Choose a current mining target and an available resource.');const amounts=splitAmount(total,count);const ready=readyMannies(mannies);if(count>ready.length)throw Error(`Only ${ready.length} onboard Mannys are available.`);const reserve=target.resourceAmounts?.[resource];if(typeof reserve==='number'&&total>reserve+1e-10)throw Error(`Only ${reserve} ECE of ${resourceName(resource)} remains on this target.`);
 const plan=miningLoads(total,count,mannies,maxCargo),stepBase={seconds:30,timeout:86400,field:'manny.currentTask',expected:'null'};
 const steps:Step[]=[];
 for(let cycle=0;cycle<plan.cycles;cycle++){
  const wave=plan.loads.filter(l=>l.amounts[cycle]!==undefined);
  steps.push({...stepBase,id:crypto.randomUUID(),kind:'command',command:{operation:'POST /api/probe/{probeId}/mannies/tasks',params:{},body:{tasks:wave.map(l=>({mannyId:l.manny.id,task:'mine',payload:{objectId:target.id,resources:[resource],targetAmount:l.amounts[cycle],...(destination?{targetContainerId:destination.id}:{})}}))}}});
  for(const l of wave)steps.push({...stepBase,id:crypto.randomUUID(),kind:'until',command:{operation:'GET /api/probe/{probeId}/mannies/{mannyId}',params:{mannyId:l.manny.id},body:null}});
 }
 return {name:`Mine ${total} ECE ${resourceName(resource)} · ${count} Mannys`,steps,cycles:1,interval:60,probeId};
}
export function checkMiningBatch(body:any,targets:MiningTarget[],mannies:MiningManny[],containers:any[]=[]){const tasks=body?.tasks;if(!Array.isArray(tasks)||!tasks.length||!tasks.every(t=>t.task==='mine'))return;const ready=new Set(readyMannies(mannies).map(m=>m.id));const used=new Set();const amounts=new Map<string,number>();for(const t of tasks){if(used.has(t.mannyId)||!ready.has(t.mannyId))throw Error('Mining stopped: a selected Manny is no longer available aboard this probe. Refresh and rebuild the mining routine.');used.add(t.mannyId);const p=t.payload;if(p?.targetContainerId&&(!containers.some(c=>c.id===p.targetContainerId)||p.resources?.includes('deuterium')))throw Error('Mining stopped: the selected detached container is unavailable or cannot store deuterium.');const target=targets.find(x=>x.id===p?.objectId);if(!target||!Array.isArray(p.resources)||!p.resources.length||p.resources.some((r:string)=>!target.resourceTypes.includes(r)))throw Error('Mining stopped: target or resources are no longer available in this sector.');if(typeof p.targetAmount!=='number'||!Number.isFinite(p.targetAmount)||p.targetAmount<=0)throw Error('Mining amounts must be positive.');if(p.resources.length===1){const key=target.id+'|'+p.resources[0];amounts.set(key,(amounts.get(key)||0)+p.targetAmount);const reserve=target.resourceAmounts?.[p.resources[0]];if(typeof reserve==='number'&&amounts.get(key)!>reserve+1e-10)throw Error('Mining stopped: the requested total exceeds the remaining reserve.');}}}
