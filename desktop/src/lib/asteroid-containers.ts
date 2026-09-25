import {api,probeGet,manniesGet,sectorGet,aboardReady} from './workshop';
import {coordKey,isCoord,type Coord} from './navigation';
import type {Command} from './engine';
export const detachContainer='POST /api/probe/{probeId}/mannies/{mannyId}/detach-storage-container';
export const recoverContainer='POST /api/probe/{probeId}/mannies/{mannyId}/recover-storage-container';
export function sectorBodies(data:any):any[]{const objects=data?.sector?.objects||[];return objects.flatMap((o:any)=>[o,...(o.minableTargets||[]),...(o.bookmarkTargets||[])]).filter((o:any,i:number,a:any[])=>o?.id&&a.findIndex(x=>x.id===o.id)===i)}
export const asteroids=(data:any)=>sectorBodies(data).filter(o=>o.type==='asteroid'&&o.estimated!==true&&o.inTransit!==true);
export const detachedContainers=(data:any)=>sectorBodies(data).filter(o=>['detached_container','detached_storage_container'].includes(o.type));
export async function checkContainerAction(c:Command,id:string,send:(c:Command)=>Promise<any>,origin?:Coord){
 const p=(await send(api(probeGet)))?.probe,m=(await send(api(manniesGet)))?.mannies,s=await send(api(sectorGet));
 if(String(p?.id)!==id||!p.inventory||!['idle','orbiting'].includes(p.status)||!isCoord(p.sector?.relative)||!isCoord(s?.sector?.relativeCoordinates)||coordKey(p.sector.relative)!==coordKey(s.sector.relativeCoordinates)||origin&&coordKey(origin)!==coordKey(p.sector.relative))throw Error('Container work requires the probe to remain in the selected asteroid’s sector.');
 if(!Array.isArray(m)||!m.some((x:any)=>x.id===c.params.mannyId&&aboardReady(x)))throw Error('Choose an idle Manny aboard this probe.');
 const body=c.body as any;
 if(c.operation===detachContainer){
  if(body?.mode!=='hidden_on_asteroid'||!asteroids(s).some(x=>x.id===body.objectId))throw Error('The selected asteroid is no longer available in this sector.');
  if(!p.inventory.containers?.some((x:any)=>x.id===body.containerId&&x.kind==='container'))throw Error('Choose an additional container aboard this probe.');
 }else if(c.operation===recoverContainer){
  if(!detachedContainers(s).some(x=>x.id===body?.objectId))throw Error('The detached container is no longer in the current scan. Refresh or inspect its asteroid first.');
  // Public mining payloads can omit destination details. Wait for all local mining
  // to finish so recovery cannot discard an unreported miner’s cargo.
  if(m.some((x:any)=>x.currentTask==='mining'))throw Error('Wait for mining to finish before recovering a container; recovery can discard active mining cargo.');
 }else throw Error('Unsupported container action.');
}
