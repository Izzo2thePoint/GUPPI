import {GameApiError} from './probe-connection';
import {crewCanTravel} from './onboard-travel';
import {pause,type Command} from './engine';
import {api,probeGet,manniesGet,aboardReady} from './workshop';
import {coordKey,isCoord,type Coord} from './navigation';
import {asteroids,detachedContainers} from './asteroid-containers';
import {splitAmount} from './mining';
export const remoteMine='POST /api/probe/{probeId}/mannies/{mannyId}/mine';
export type Outpost={id:string;probeId:string;name:string;coord:Coord;targetId:string;containerId:string;containerIds?:string[];fullContainerIds?:string[];resource:string;mannyIds:string[];total:number;maxCargo:number;remaining:Record<string,number>;status:'paused'|'running'|'complete'|'review'|'blocked';message:string};
export type LeaveCrew=Pick<Outpost,'id'|'name'|'coord'|'targetId'|'containerId'|'mannyIds'|'containerIds'>;
export const outpostContainers=(s:Pick<Outpost,'containerId'|'containerIds'>)=>s.containerIds?.length?s.containerIds:[s.containerId];
export function validateOutpost(s:Outpost){
 if(!s.id||!s.probeId||!s.name.trim()||!isCoord(s.coord)||!s.targetId||!s.containerId||!['metals','ice','carbon_compounds'].includes(s.resource))throw Error('Choose an outpost name, sector, asteroid, container, and solid resource.');
 if(!Array.isArray(s.mannyIds)||!s.mannyIds.length||new Set(s.mannyIds).size!==s.mannyIds.length||s.mannyIds.some(id=>!id))throw Error('Select distinct Mannys for this outpost.');
 if(s.containerIds!==undefined&&(!Array.isArray(s.containerIds)||!s.containerIds.length||new Set(s.containerIds).size!==s.containerIds.length||s.containerIds.some(id=>typeof id!=='string'||!id)||!s.containerIds.includes(s.containerId)))throw Error('Choose distinct destination containers, including the primary container.');
 splitAmount(s.total,s.mannyIds.length);if(!Number.isFinite(s.maxCargo)||s.maxCargo<.000001||s.maxCargo>100)throw Error('Enter a cargo limit between 0.000001 and 100 ECE.');
 if(s.mannyIds.some(id=>!Number.isFinite(s.remaining[id])||s.remaining[id]<0||s.remaining[id]>s.total))throw Error('Saved mining amounts are invalid.');
}
export function outpostRemaining(total:number,ids:string[]){const amounts=splitAmount(total,ids.length);return Object.fromEntries(ids.map((id,i)=>[id,amounts[i]]));}
export function sameSector(a:any,b:Coord){return isCoord(a)&&coordKey(a)===coordKey(b);}
export function taskAtOutpost(m:any,s:LeaveCrew){return m.currentTask==='mining'&&m.task?.objectId===s.targetId&&outpostContainers(s).includes(m.task?.targetContainer?.id);}
export function departureCrew(mannies:any[],leave:LeaveCrew[]=[]){
 if(!Array.isArray(mannies))throw Error('Manny telemetry is unavailable.');
 const ids=leave.flatMap(s=>s.mannyIds);if(new Set(ids).size!==ids.length)throw Error('A Manny is assigned to more than one outpost.');
 for(const s of leave)for(const id of s.mannyIds){const m=mannies.find(m=>m.id===id);if(!m||m.location?.type!=='sector'||!sameSector(m.location.sector?.relative,s.coord))throw Error(`Outpost ${s.name}: deploy ${id} at ${coordKey(s.coord)} before departure.`);if(m.currentTask!==null&&m.currentTask!=='unknown_too_far'&&!taskAtOutpost(m,s))throw Error(`Outpost ${s.name}: ${id} is doing a different task. Check it before leaving.`);}
 return mannies.filter(m=>!ids.includes(m.id)&&!crewCanTravel(m));
}
export const sectorCommand=(coord:Coord)=>api('GET /api/sector',null,Object.fromEntries(['x','y','z'].map(k=>[k,String(coord[k as keyof Coord])])));
export function checkOutpostSector(data:any,s:Outpost){
 const sector=data?.sector;if(!sameSector(sector?.relativeCoordinates,s.coord)||!['live','degraded_live'].includes(sector?.dataFreshness))throw Error('A live scan of the outpost sector is required.');
 const rock=asteroids(data).find(r=>r.id===s.targetId),box=detachedContainers(data).find(c=>c.id===s.containerId&&c.mode==='hidden_on_asteroid'&&c.targetObjectId===s.targetId);
 if(!rock||!rock.resourceTypes?.includes(s.resource)||!box)throw Error('The asteroid, resource, or its attached container is no longer available.');
 if(Number(rock.resourceAmounts?.[s.resource])<=0)throw Error('The selected asteroid resource is exhausted.');
 return rock;
}
export function sharedScut(a:any,b:any){return [a,b].every(s=>['live','degraded_live'].includes(s?.dataFreshness)&&s?.scutCoverageStatus==='covered')&&a.scutNetworks?.some((n:any)=>b.scutNetworks?.some((x:any)=>x.id===n.id));}
/** Persist review BEFORE each mutation. Never retry an unconfirmed mining order. */
export async function runOutpost(site:Outpost,{signal,send,save,report,wait=pause,now=Date.now}:{signal:AbortSignal;send:(c:Command,remote?:boolean)=>Promise<any>;save:(s:Outpost)=>void;report:(text:string)=>void;wait?:(ms:number,s:AbortSignal)=>Promise<void>;now?:()=>number}){
 validateOutpost(site);let s=structuredClone(site);const deadline=now()+168*3600000;let loads=0;
 const commit=(patch:Partial<Outpost>)=>{s={...s,...patch};save(s);};
 const call=async(c:Command,remote=false)=>{if(signal.aborted)throw Error('Stopped');const result=await send(c,remote);if(signal.aborted)throw Error('Stopped');return result;};
 const idleWait=async(text:string)=>{report(text);await wait(15000,signal);};
 commit({status:'running',message:'Checking outpost and crew.'});
 try{while(true){
  if(signal.aborted)throw Error('Stopped');if(now()>=deadline)throw Error('Outpost run reached its 7-day limit. Check the game before continuing.');
  const p=(await call(api(probeGet)))?.probe;if(String(p?.id)!==s.probeId||!isCoord(p.sector?.relative))throw Error('Probe position is unavailable.');
  const mannies=(await call(api(manniesGet)))?.mannies;if(!Array.isArray(mannies))throw Error('Manny telemetry is unavailable.');
  const crew=s.mannyIds.map(id=>mannies.find((m:any)=>m.id===id));if(crew.some(m=>!m))throw Error('An assigned Manny is missing.');
  if(crew.some(m=>m.currentTask==='unknown_too_far')){await idleWait('Waiting for SCUT contact. No new orders are sent outside coverage.');continue;}
  const working=crew.some(m=>m.currentTask!==null);
  if(working){
   if(crew.some(m=>m.currentTask!==null&&!taskAtOutpost(m,s)&&m.currentTask!=='returning'&&m.currentTask!=='waiting_for_space'))throw Error('An assigned Manny is doing a different task.');
   if(crew.some(m=>m.task?.targetContainerFull))throw Error('A container filled during an accepted load. Check the Manny’s cargo before resuming; delivery cannot be confirmed.');
  }
  if(s.mannyIds.every(id=>s.remaining[id]<=0)){if(working){await idleWait('Waiting for the final accepted loads to finish.');continue;}commit({status:'complete',message:'All planned loads finished. The crew remains designated for this outpost.'});return;}
  const m=crew.find(m=>m.currentTask===null&&s.remaining[m.id]>0);if(!m){await idleWait('Waiting for assigned miners to finish their accepted loads.');continue;}
  if(!['idle','orbiting'].includes(p.status)){await idleWait('Probe travelling. New outpost orders resume at a stationary stop with SCUT contact.');continue;}
  const remote=!sameSector(p.sector.relative,s.coord);
  const observation=await call(sectorCommand(s.coord));
  if(remote&&!['live','degraded_live'].includes(observation?.sector?.dataFreshness)){await idleWait('Waiting for live SCUT observations of the outpost.');continue;}
  const available=outpostContainers(s).filter(id=>!s.fullContainerIds?.includes(id));const boxes=detachedContainers(observation);const chosen=available.find(id=>boxes.some(b=>b.id===id&&b.mode==='hidden_on_asteroid'&&b.targetObjectId===s.targetId&&(!Number.isFinite(b.freeCapacity)||b.freeCapacity>0)));if(!chosen)throw Error('All selected containers are full or unavailable. Add storage and create a plan for the remaining amount.');const rock=checkOutpostSector(observation,{...s,containerId:chosen});
  if(remote){const here=await call(sectorCommand(p.sector.relative));if(!sharedScut(here?.sector,observation.sector)){await idleWait('Waiting for the probe and outpost to share an active SCUT network.');continue;}}
  // One load at a time per worker, checking all telemetry again before the next order.
  if(remote?m.location?.type!=='sector'||!sameSector(m.location.sector?.relative,s.coord):!(aboardReady(m)||m.location?.type==='sector'&&sameSector(m.location.sector?.relative,s.coord)))throw Error('A selected Manny is no longer at the outpost or aboard the local probe.');
  const capacity=m.cargo?.capacity??.05;if(!Number.isFinite(capacity)||capacity<=0)throw Error('Manny cargo capacity is unavailable.');
  const amount=Math.floor(Math.min(s.remaining[m.id],s.maxCargo,capacity)*1e6+1e-8)/1e6;if(amount<.000001)throw Error('The remaining load is too small.');
  if(typeof rock.resourceAmounts?.[s.resource]==='number'&&rock.resourceAmounts[s.resource]+1e-10<amount)throw Error('Not enough resource remains for the next planned load.');
  if(++loads>10000)throw Error('This run reached 10,000 loads. Check the outpost before continuing.');
  const order=api(remoteMine,{objectId:s.targetId,resources:[s.resource],targetAmount:amount,targetContainerId:chosen},{mannyId:m.id});
  commit({status:'review',message:`Sending ${amount} ECE order to ${m.name||m.id}. If interrupted, check the game before recreating this plan.`});
  let accepted:any;try{accepted=(await call(order,remote))?.manny}catch(e){if(outpostContainers(s).length>1&&e instanceof GameApiError&&e.status===422&&/container.*full|full.*container|capacity|storage.*full|not enough space/i.test(e.code+' '+e.message)){commit({status:'running',fullContainerIds:[...new Set([...(s.fullContainerIds||[]),chosen])],message:'Container full; trying the next selected destination.'});continue;}throw e;}
  if(!accepted||accepted.id!==m.id||!taskAtOutpost(accepted,s)||accepted.task?.targetContainer?.id!==chosen)throw Error('Mining acceptance was not confirmed. Check the game; do not repeat this order blindly.');
  const resources=Array.isArray(accepted.task.resourceTypes)?accepted.task.resourceTypes:typeof accepted.task.resourceType==='string'?[accepted.task.resourceType]:[];
  if(resources.length!==1||resources[0]!==s.resource)throw Error('The accepted mining resource could not be verified. Check the game before continuing this plan.');
  const actual=accepted.task?.targetAmount;if(!Number.isFinite(actual)||actual<=0||actual>amount+1e-10)throw Error('The accepted mining amount could not be verified.');
  commit({remaining:{...s.remaining,[m.id]:Math.max(0,Math.round((s.remaining[m.id]-actual)*1e6)/1e6)},status:'running',message:`${actual} ECE accepted for ${m.name||m.id}.`});
  if(actual+1e-10<amount){if(outpostContainers(s).length===1)throw Error('The game capped the load to container space. Further orders stopped; the accepted load continues.');commit({fullContainerIds:[...new Set([...(s.fullContainerIds||[]),chosen])],message:'Partial load accepted; next loads use another selected container.'});}
 }}catch(e){if(s.status==='review')throw e;commit({status:signal.aborted?'paused':'blocked',message:signal.aborted?'Future orders stopped. Accepted game tasks continue.':(e as Error).message});throw e;}
}
