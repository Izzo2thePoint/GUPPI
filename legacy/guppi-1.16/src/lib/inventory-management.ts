import {api,probeGet,manniesGet,aboardReady} from './workshop';
import type {Command} from './engine';
import type {Claim} from './task-coordinator';

export const storageRules='PATCH /api/probe/{probeId}/storage-containers/{containerId}/rules';
export const storageMove='POST /api/probe/{probeId}/storage-moves';
export const ruleKeys=['priority','exclusion','strictExclusion'] as const;
export type StorageRules=Record<typeof ruleKeys[number],string[]>;
export const emptyRules=():StorageRules=>({priority:[],exclusion:[],strictExclusion:[]});
export function readRules(value:any):StorageRules {
 if(!value||ruleKeys.some(k=>!Array.isArray(value[k])||value[k].some((v:any)=>typeof v!=='string'||!v.trim())))throw Error('Container rules are unavailable. Refresh before editing.');
 return Object.fromEntries(ruleKeys.map(k=>[k,[...new Set<string>(value[k])].sort()])) as StorageRules;
}
export const sameRules=(a:any,b:any)=>JSON.stringify(readRules(a))===JSON.stringify(readRules(b));
export function rulesCommand(containerId:string,rules:StorageRules,expected:StorageRules):Command {
 if(!containerId)throw Error('Choose a container.');
 return {...api(storageRules,readRules(rules),{containerId}),expectedStorageRules:readRules(expected)};
}
export function resourceInContainer(inventory:any,type:string,id:string):number {
 return (inventory?.resourceStocks||[]).filter((s:any)=>s.type===type).reduce((total:number,s:any)=>total+(s.containers||[]).filter((c:any)=>String(c.container?.id)===id).reduce((n:number,c:any)=>n+(Number.isFinite(c.amount)?c.amount:0),0),0);
}
export type MoveDraft={actorMannyId:string;kind:'resource'|'item'|'manny';fromContainerId:string;toContainerId:string;resourceType:string;amount:number;ids:string[]};
export function moveCommand(d:MoveDraft):Command {
 const base={actorMannyId:d.actorMannyId,kind:d.kind,fromContainerId:d.fromContainerId,toContainerId:d.toContainerId};
 return api(storageMove,d.kind==='resource'?{...base,resourceType:d.resourceType,amount:d.amount}:d.kind==='manny'?{...base,targetMannyIds:[...d.ids]}:{...base,itemIds:[...d.ids]});
}
export function checkMove(c:Command,probe:any,crew:any[],id:string){
 const b=c.body as any,inv=probe?.inventory;
 if(String(probe?.id)!==id||!inv||!Array.isArray(inv.items)||!Array.isArray(inv.containers)||!Array.isArray(crew)||['dead','disabled','out_of_scut_range','trapped_by_black_hole'].includes(probe.status))throw Error('Fresh inventory and crew readings from this probe are required.');
 if(!b||!crew.some(m=>String(m.id)===b.actorMannyId&&aboardReady(m)))throw Error('Choose an idle transfer Manny aboard this probe.');
 const source=inv.containers.find((x:any)=>String(x.id)===b.fromContainerId),target=inv.containers.find((x:any)=>String(x.id)===b.toContainerId);
 if(!source||!target||source.id===target.id)throw Error('Choose two different containers aboard this probe.');
 let space=0;const items:any[]=[];
 if(b.kind==='resource'){
  if(!['metals','ice','carbon_compounds'].includes(b.resourceType)||!Number.isFinite(b.amount)||b.amount<=0)throw Error('Choose a stored resource and an amount greater than zero in ECE.');
  if(b.amount>resourceInContainer(inv,b.resourceType,b.fromContainerId)+1e-9)throw Error('The source container no longer has enough of that resource. Refresh the inventory.');
  space=b.amount;
 }else if(b.kind==='item'||b.kind==='manny'){
  const ids=b.kind==='item'?b.itemIds:b.targetMannyIds;
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('Select at least one distinct item or Manny to move.');
  for(const itemId of ids){
   const item=inv.items.find((i:any)=>String(i.id)===itemId);
   if(!item||String(item.container?.id)!==b.fromContainerId)throw Error('A selected item changed container or is no longer aboard. Refresh and select it again.');
   if(item.type==='additional_container')throw Error('Additional containers cannot be moved as inventory items.');
   if((b.kind==='manny')!==(item.type==='manny'))throw Error('Use the Mannys category to move a Manny.');
   if(item.currentTask!=null)throw Error('A selected item is working. Wait for it to become idle.');
   if(b.kind==='manny'&&(itemId===b.actorMannyId||!crew.some(m=>String(m.id)===itemId&&aboardReady(m))))throw Error('A target Manny must be idle aboard and different from the transfer Manny.');
   if(!Number.isFinite(item.containerSpace)||item.containerSpace<0)throw Error('The selected item’s cargo space is unavailable.');
   items.push(item);space+=item.containerSpace;
  }
 }else throw Error('Choose resources, items, or Mannys.');
 if(!Number.isFinite(target.freeCapacity)||space>target.freeCapacity+1e-9)throw Error('The destination container does not have enough free space.');
 return {items,space};
}
export async function checkInventoryAction(c:Command,id:string,send:(c:Command)=>Promise<any>,reserve?:(claims:Claim[])=>void){
 if(c.operation===storageRules){
  const current=(await send(api('GET /api/probe/{probeId}/storage-containers/{containerId}',null,c.params)))?.container;
  if(String(current?.id)!==c.params.containerId||!c.expectedStorageRules||!sameRules(current.rules,c.expectedStorageRules))throw Error('These rules changed in the game. Your draft is kept; reload the current rules before saving again.');
  c.body=readRules(c.body);delete c.expectedStorageRules;return;
 }
 const p=(await send(api(probeGet)))?.probe,m=(await send(api(manniesGet)))?.mannies;
 const {items}=checkMove(c,p,m,id);
 if(items.some(i=>i.type==='atomic_3d_printer')){
  reserve?.([{key:'printer'}]);
  for(const printer of items.filter(i=>i.type==='atomic_3d_printer')){const current=(await send(api('GET /api/probe/{probeId}/inventory/{itemId}',null,{itemId:String(printer.id)})))?.item;if(String(current?.id)!==String(printer.id)||current.currentTask!==null)throw Error('The selected atomic printer is busy or its state is unavailable.');}
 }
}
