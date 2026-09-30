import {utilityOperations,checkUtility,renameOperations,renameProbe,renameManny,jettisonCargo,inspectObject,salvageObject} from './crew-utilities';
import {storageRules,storageMove,checkInventoryAction} from './inventory-management';
import {checkContainerAction,detachContainer,recoverContainer} from './asteroid-containers';
import {planCraft} from './craft-plan';
import {logbookCreate,logbookUpdate,logbookDelete,logbookRead,logbookBody,sameLogbookPage} from './logbook';
import type {Command} from './engine';
import {api,probeGet,manniesGet,sectorGet,craftManny,craftPrinter,checkCraft,messageBody,aboardReady} from './workshop';
import {isCoord,coordKey} from './navigation';
import {assembleProbe,checkAssembly} from './probe-construction';
import {probeOperations,checkProbeOperation,launchAsteroid} from './probe-operations';
import type {Claim} from './task-coordinator';
const relayOn='POST /api/probe/{probeId}/mannies/{mannyId}/turn-on-relay';
const beacon='POST /api/probe/{probeId}/mannies/{mannyId}/install-scut-transit-beacon';
const allowed=[...utilityOperations,storageRules,storageMove,detachContainer,recoverContainer,assembleProbe,craftManny,craftPrinter,relayOn,beacon,'POST /api/probe/{probeId}/messages','PATCH /api/probe/{probeId}/messages/{messageId}/read','PATCH /api/probe/{probeId}/alerts/{alertId}'];
export async function executeWorkshopAction(original:Command,probeId:string,send:(c:Command)=>Promise<any>,reserve?:(claims:Claim[])=>void){
 const c=structuredClone(original);
 if(![...allowed,...probeOperations,logbookCreate,logbookUpdate,logbookDelete].includes(c.operation))throw Error('Unsupported workshop action.');
 if(!probeId)throw Error('Select a probe first.');
 if([logbookCreate,logbookUpdate].includes(c.operation)){const b=c.body as any;c.body=logbookBody(b?.title,b?.content);}
 if([logbookUpdate,logbookDelete].includes(c.operation)){
  const old=c.expectedLogbookPage,current=(await send(api(logbookRead,null,c.params)))?.page;
  if(!old||String(old.probeId)!==probeId||String(old.id)!==c.params.logbookPageId||!current||!sameLogbookPage(old,current))throw Error('This page changed in the game. Your draft is kept. Reload the game page before editing again.');
 }
 delete c.expectedLogbookPage;
 if(utilityOperations.includes(c.operation))await checkUtility(c,probeId,send,reserve);
 if([storageRules,storageMove].includes(c.operation))await checkInventoryAction(c,probeId,send,reserve);
 if(probeOperations.includes(c.operation))await checkProbeOperation(c,probeId,send);
 if([detachContainer,recoverContainer].includes(c.operation))await checkContainerAction(c,probeId,send);
 if(c.operation===assembleProbe){const p=(await send(api(probeGet)))?.probe,m=(await send(api(manniesGet)))?.mannies;checkAssembly(c,p,m,probeId);}
 if([craftManny,craftPrinter,relayOn,beacon].includes(c.operation)){
  const p=(await send(api(probeGet)))?.probe,m=(await send(api(manniesGet)))?.mannies;
  if(!p||String(p.id)!==probeId||!p.inventory||!Array.isArray(m))throw Error('Fresh probe, inventory, and Manny telemetry are required.');
  if(c.operation===craftManny||c.operation===craftPrinter){
   const recipes=(await send(api('GET /api/crafting-recipes')))?.recipes;
   if(!Array.isArray(recipes))throw Error('Recipes are unavailable.');
   checkCraft(c,p,m,recipes,probeId);
   if((c.body as any).recipe==='additional_container')reserve?.([{key:'new-container'}]);
   if(c.operation===craftPrinter||planCraft(recipes.find((r:any)=>r.id===(c.body as any).recipe),recipes,p).needsPrinter){const printers=p.inventory.items.filter((i:any)=>i.type==='atomic_3d_printer');let idle=false;
    reserve?.([{key:'printer'}]);
    for(const printer of printers){const r=await send(api('GET /api/probe/{probeId}/inventory/{itemId}',null,{itemId:String(printer.id)}));if(String(r.item?.id)===String(printer.id)&&r.item.type==='atomic_3d_printer'&&r.item.currentTask===null)idle=true;}
    if(!idle)throw Error('The atomic printer is busy or its task state is unavailable.');
   }
  }else{
   if(!['idle','orbiting'].includes(p.status))throw Error('The probe must be stationary for relay work.');
   if(!m.some((m:any)=>String(m.id)===c.params.mannyId&&aboardReady(m)))throw Error('Choose an idle Manny aboard the probe.');
   const s=(await send(api(sectorGet)))?.sector;
   if(!isCoord(p.sector?.relative)||!isCoord(s?.relativeCoordinates)||coordKey(p.sector.relative)!==coordKey(s.relativeCoordinates))throw Error('Current sector could not be verified.');
   const id=(c.body as any)?.relayId,relay=s.objects?.find((o:any)=>o.type==='scut_relay'&&String(o.id)===String(id));
   if(!Number.isSafeInteger(id)||id<1||!relay)throw Error('This relay is no longer reported in the current sector.');
   const item=c.operation===beacon?'scut_transit_beacon':'integrated_circuit';
   if(!p.inventory.items?.some((i:any)=>i.type===item))throw Error(`Relay work needs one ${item.replaceAll('_',' ')} in inventory.`);
   if(c.operation===beacon&&(relay.status==='off'||relay.isTransitBeacon===true))throw Error('Beacon installation requires an active relay without a transit beacon.');
   if(c.operation===relayOn){if(relay.status==='on')throw Error('This relay is already on.');if(!s.objects?.some((o:any)=>o.type==='star'||o.type==='solar_system'&&o.starCount>0))throw Error('No local star is reported to power this relay.');}
  }
 }
 if(c.operation==='POST /api/probe/{probeId}/messages'){
  const b=c.body as any;c.body=messageBody(b?.recipient?.type,String(b?.recipient?.id??''),b?.body??'');
 }
 const result=await send(c);
 if(renameOperations.includes(c.operation)){
  const isProbe=c.operation===renameProbe,isManny=c.operation===renameManny;
  const id=isProbe?probeId:isManny?c.params.mannyId:c.params.containerId;
  // The probe PATCH contract returns the owned-probe list; older bridges may return a probe object.
  const entity=isProbe?(Array.isArray(result?.probes)?result.probes.find((p:any)=>String(p.id)===id):result?.probe):isManny?result?.manny:result?.container;
  const field=isProbe||isManny?'name':'label';
  if(String(entity?.id)!==id||entity?.[field]!==(c.body as any)[field])throw Error('Rename was not confirmed. Refresh the game data before trying again.');
 }
 if(c.operation===jettisonCargo&&(!result?.inventory||!result?.jettisoned||typeof result.jettisoned.type!=='string'))throw Error('Jettison was not confirmed. Refresh inventory before trying again; the cargo may already have been removed.');
 if([inspectObject,salvageObject].includes(c.operation)&&(!result?.manny||result.manny.id!==c.params.mannyId||typeof result.manny.currentTask!=='string'||!result.manny.currentTask))throw Error('Utility task was not confirmed. Check the game before retrying.');
 if(c.operation===storageRules&&(String(result?.container?.id)!==c.params.containerId))throw Error('Rule save was not confirmed. Refresh before trying again.');
 if(c.operation===storageMove&&(String(result?.manny?.id)!==String((c.body as any).actorMannyId)||!result.manny.currentTask))throw Error('Transfer was not confirmed. Check the Manny before trying again.');
 if([logbookCreate,logbookUpdate].includes(c.operation)&&(!result?.page||String(result.page.probeId)!==probeId))throw Error('Save was not confirmed. Your draft is kept. Sync and check the game before saving again.');
 if(c.operation==='POST /api/probe/{probeId}/messages'&&!result?.message)throw Error('Delivery response was incomplete. Check the game before sending again.');
 if([...probeOperations.filter(x=>x!==launchAsteroid),detachContainer,recoverContainer,assembleProbe,craftManny,craftPrinter,relayOn,beacon].includes(c.operation)&&!result?.manny)throw Error('Task response was incomplete. Check the Manny before repeating the order.');
 if(c.operation===launchAsteroid&&(!result?.trajectory?.id||String(result.trajectory.asteroidId)!==c.params.asteroidId))throw Error('Launch response was incomplete. Check the asteroid before repeating the order.');
 return result;
}

