import {api,probeGet,manniesGet,sectorGet,aboardReady} from './workshop';
import {sectorBodies} from './asteroid-containers';
import {resourceInContainer} from './inventory-management';
import {coordKey,isCoord} from './navigation';
import type {Command} from './engine';
import type {Claim} from './task-coordinator';
export const renameProbe='PATCH /api/probe/{probeId}',renameManny='PATCH /api/probe/{probeId}/mannies/{mannyId}',renameContainer='PATCH /api/probe/{probeId}/storage-containers/{containerId}';
export const renameOperations=[renameProbe,renameManny,renameContainer];
export const inspectObject='POST /api/probe/{probeId}/mannies/{mannyId}/inspect-sector-object',salvageObject='POST /api/probe/{probeId}/mannies/{mannyId}/salvage',jettisonCargo='POST /api/probe/{probeId}/inventory/{itemId}/jettison';
export const utilityOperations=[...renameOperations,inspectObject,salvageObject,jettisonCargo];
export function renameCommand(kind:'probe'|'manny'|'container',id:string,name:string){name=typeof name==='string'?name.trim():'';const max=kind==='manny'?40:80;if(!name||name.length>max)throw Error(`Enter a name of 1–${max} characters.`);return api(kind==='probe'?renameProbe:kind==='manny'?renameManny:renameContainer,kind==='container'?{label:name}:{name},kind==='probe'?{}:kind==='manny'?{mannyId:id}:{containerId:id});}
export async function checkUtility(c:Command,id:string,send:(c:Command)=>Promise<any>,reserve?:(claims:Claim[])=>void){
 const b=c.body as any;
 if(renameOperations.includes(c.operation)){const kind=c.operation===renameProbe?'probe':c.operation===renameManny?'manny':'container';c.body=renameCommand(kind,c.params.mannyId||c.params.containerId||id,kind==='container'?b?.label:b?.name).body;return;}
 const p=(await send(api(probeGet)))?.probe,crew=(await send(api(manniesGet)))?.mannies;
 if(String(p?.id)!==id||!p.inventory||!Array.isArray(crew)||!['idle','orbiting'].includes(p.status))throw Error('A stationary probe with current inventory and crew readings is required.');
 if(c.operation===jettisonCargo){
  const inv=p.inventory,stock=inv.resourceStocks?.find((s:any)=>s.id===c.params.itemId);
  if(stock){if(!['metals','ice','carbon_compounds'].includes(stock.type)||!Number.isFinite(b?.amount)||b.amount<=0||b.amount>resourceInContainer(inv,stock.type,b.containerId)+1e-9)throw Error('Choose an available source container and a valid resource amount.');}
  else{const item=inv.items?.find((i:any)=>i.id===c.params.itemId);if(!item||['additional_container','manny'].includes(item.type)||item.currentTask!=null)throw Error('Choose an idle cargo item. Containers and Mannys are excluded from this jettison control.');reserve?.([{key:'container:'+item.container?.id},{key:'item:'+item.id}]);if(item.type==='atomic_3d_printer'){reserve?.([{key:'printer'}]);const r=(await send(api('GET /api/probe/{probeId}/inventory/{itemId}',null,c.params)))?.item;if(r?.id!==item.id||r.currentTask!==null)throw Error('The printer is busy or its state cannot be confirmed.');}c.body={};}
  return;
 }
 if(!crew.some(m=>String(m.id)===c.params.mannyId&&aboardReady(m)))throw Error('Choose an idle onboard Manny.');
 const s=await send(api(sectorGet));if(!isCoord(s?.sector?.relativeCoordinates)||!isCoord(p.sector?.relative)||coordKey(s.sector.relativeCoordinates)!==coordKey(p.sector.relative))throw Error('Current sector could not be verified.');
 const object=sectorBodies(s).find(o=>String(o.id)===b?.objectId);if(!object||(c.operation===inspectObject?object.inspectable!==true:object.salvageable!==true))throw Error('That object is no longer available for this action. Refresh the sector.');
 if(c.operation===salvageObject&&['detached_container','detached_storage_container'].includes(object.type)&&crew.some(m=>m.currentTask==='mining'))throw Error('Finish mining before recovering a container; recovery can interrupt miners and discard their cargo.');
}
