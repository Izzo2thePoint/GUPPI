import {planCraft} from './craft-plan';
import {detachContainer,checkContainerAction} from './asteroid-containers';
import {isCoord,coordKey,type Coord} from './navigation';
import {pause,type Command} from './engine';
import {api,probeGet,manniesGet,craftManny,craftPrinter,aboardReady} from './workshop';
import {executeWorkshopAction} from './workshop-actions';
import type {Claim} from './task-coordinator';

export type CraftDraft={probeId:string;recipeId:string;name:string;method:'manny'|'atomic_3d_printer';mannyId:string;until:'count'|'full';count:number;ensureStock?:boolean;deployAsteroid?:{id:string;name:string;origin:Coord}};
export type CraftJob=CraftDraft&{id:string;completed:number;status:'queued'|'checking'|'crafting'|'done'|'blocked'|'review';message:string;builder?:string;progress?:number};
export function validateCraftDraft(d:CraftDraft){
 if(d?.deployAsteroid&&(!d.deployAsteroid.id||!isCoord(d.deployAsteroid.origin)||d.recipeId!=='additional_container'||d.method!=='manny'||d.until!=='count'||d.count!==1))throw Error('Construct and place needs one additional container, an asteroid, and a Manny.');
 if(!d||typeof d.probeId!=='string'||!d.probeId||typeof d.recipeId!=='string'||!d.recipeId||typeof d.name!=='string'||!d.name)throw Error('Choose a connected probe and crafting recipe.');
 if(!['manny','atomic_3d_printer'].includes(d.method)||d.method==='manny'&&!d.mannyId)throw Error('Choose a crafter for the queued job.');
 if(d.ensureStock!==undefined&&typeof d.ensureStock!=='boolean')throw Error('Invalid stock target.');
 if(d.ensureStock&&d.until!=='count')throw Error('Stock targets require a fixed quantity.');
 if(!['count','full'].includes(d.until)||!Number.isInteger(d.count)||d.count<1||d.count>1000)throw Error('Choose a stop condition and a loop count from 1 to 1,000.');
}
export function restoreCraftQueue(raw:string):CraftJob[]{
 const values=JSON.parse(raw);if(!Array.isArray(values)||values.length>100)throw Error('Saved construction queue is invalid.');
 const ids=new Set();return values.map(j=>{validateCraftDraft(j);if(typeof j.id!=='string'||ids.has(j.id)||!Number.isInteger(j.completed)||j.completed<0||!['queued','checking','crafting','done','blocked','review'].includes(j.status))throw Error('Saved construction job is invalid.');ids.add(j.id);return ['checking','crafting'].includes(j.status)?{...j,status:'review',message:'Interrupted session. Check this craft in the game before removing and recreating its remaining work.'}:j;});
}
export function cargoStop(inventory:any,recipe:any){
 const free=inventory?.freeCapacity,space=recipe?.output?.containerSpace;
 if(!Number.isFinite(free)||free<0||!Number.isFinite(space)||space<0)throw Error('Current cargo capacity and recipe output size are required.');
 return free<=1e-9||space>free+1e-9;
}
type Options={job:CraftJob;signal:AbortSignal;send:(c:Command)=>Promise<any>;report:(patch:Partial<CraftJob>)=>void;wait?:(ms:number,signal:AbortSignal)=>Promise<void>;now?:()=>number;reserve?:(claims:Claim[])=>Promise<void>;release?:()=>void;execute?:typeof executeWorkshopAction};
/** A confirmed idle builder completes one cycle. Interrupted or uncertain orders never retry automatically. */
export async function runCraftJob({job,signal,send,report,wait=pause,now=Date.now,reserve,release,execute=executeWorkshopAction}:Options){
 validateCraftDraft(job);let completed=job.completed,dispatched=false;
 const check=()=>{if(signal.aborted)throw Error('Stopped');};
 const read=async(c:Command)=>{check();const result=await send(c);check();return result;};
 try{
  while(job.ensureStock||job.until==='full'||completed<job.count){
   check();report({status:'checking',completed,message:'Checking current ingredients, cargo space, and crafter.',progress:undefined});
   const p=(await read(api(probeGet)))?.probe,recipes=(await read(api('GET /api/crafting-recipes')))?.recipes;
   if(String(p?.id)!==job.probeId||!p?.inventory||!Array.isArray(recipes))throw Error('Current probe and recipe data are unavailable.');
   if(job.deployAsteroid&&(!isCoord(p.sector?.relative)||coordKey(p.sector.relative)!==coordKey(job.deployAsteroid.origin)))throw Error('The probe left the selected asteroid sector.');
   let previousContainers=new Set((p.inventory.containers||[]).map((c:any)=>c.id));
   const recipe=recipes.find((r:any)=>r.id===job.recipeId);if(!recipe)throw Error('This recipe is no longer available.');
   if(job.ensureStock&&(p.inventory.items||[]).filter((i:any)=>i.type===recipe.output?.type).length>=job.count){report({status:'done',completed,message:'Required parts are now aboard.',progress:undefined});return;}
   if(job.ensureStock&&completed>=job.count)throw Error('The stock target was not reached within the craft limit. Check inventory and other consumers before retrying.');
   if(job.until==='full'&&Number(recipe.output?.capacityBonus)>0)throw Error('Storage-expanding recipes need a fixed loop count; they increase the space available.');
   if(job.until==='full'&&cargoStop(p.inventory,recipe)){report({status:'done',completed,message:'Stopped: inventory is full or has no room for the next item.',progress:undefined});return;}
   if(!Number.isFinite(recipe.durationSeconds)||recipe.durationSeconds<0)throw Error('Recipe duration is unavailable.');
   const planned=planCraft(recipe,recipes,p);
   await reserve?.([...(job.method==='manny'?[{key:'manny:'+job.mannyId}]:[]),...(planned.needsPrinter||job.method==='atomic_3d_printer'?[{key:'printer'}]:[]),...(job.recipeId==='additional_container'?[{key:'new-container'}]:[]),...(job.deployAsteroid?[{key:'asteroid:'+job.deployAsteroid.id,shared:true}]:[])]);
   if(job.deployAsteroid&&reserve){const fresh=(await read(api(probeGet)))?.probe;if(!Array.isArray(fresh?.inventory?.containers))throw Error('Container inventory is unavailable.');previousContainers=new Set(fresh.inventory.containers.map((c:any)=>c.id));}
   const c=api(job.method==='manny'?craftManny:craftPrinter,{recipe:job.recipeId},job.method==='manny'?{mannyId:job.mannyId}:{});
   const accepted=await execute(c,job.probeId,async next=>{
    check();if(next.operation===c.operation){report({status:'crafting',completed,message:`Sending craft ${completed+1}; waiting for acceptance.`});dispatched=true;}
    return read(next);
   });
   const builder=accepted?.manny,expected=job.method==='manny'?'crafting':'assisting_atomic_printer';
   if(typeof builder?.id!=='string'||job.method==='manny'&&builder.id!==job.mannyId||builder.currentTask!==expected)throw Error('Craft acceptance could not be verified.');
   const deadline=now()+Math.min(7*86400000,Math.max(3600000,(planned.durationSeconds*3+900)*1000));
   report({status:'crafting',builder:builder.id,completed,progress:0,message:`Craft ${completed+1} accepted. Waiting for ${builder.name||builder.id} to finish.`});
   while(true){
    check();if(now()>=deadline)throw Error('Craft completion timed out.');
    const data=await read(api(manniesGet));if(!Array.isArray(data?.mannies))throw Error('Manny status is unavailable.');
    const current=data.mannies.find((m:any)=>m.id===builder.id);if(!current)throw Error('The builder is no longer reported aboard this probe.');
    if(aboardReady(current))break;
    if(current.currentTask!==expected||current.location?.type!=='probe'||builder.taskStartTime&&current.taskStartTime&&builder.taskStartTime!==current.taskStartTime)throw Error('The builder task changed or cannot be verified.');
    report({progress:Number.isFinite(current.taskProgressPercent)?current.taskProgressPercent:undefined,message:`Craft ${completed+1} in progress. Waiting before the next order.`});
    await wait(Math.min(15000,Math.max(1,deadline-now())),signal);
   }
   if(job.deployAsteroid){
    const after=(await read(api(probeGet)))?.probe;
    const added=after?.inventory?.containers?.filter((c:any)=>c.kind==='container'&&!previousContainers.has(c.id));
    if(added?.length!==1)throw Error('The newly constructed container could not be uniquely verified. Check inventory before placing it.');
    const placement=api(detachContainer,{containerId:added[0].id,mode:'hidden_on_asteroid',objectId:job.deployAsteroid.id},{mannyId:job.mannyId});
    await checkContainerAction(placement,job.probeId,read,job.deployAsteroid.origin);
    report({message:'Placing the new container on '+job.deployAsteroid.name+'.',progress:undefined});
    const placed=await read(placement);
    if(placed?.manny?.id!==job.mannyId||placed.manny.currentTask!=='detaching_storage_container')throw Error('Container placement acceptance could not be verified.');
    const end=now()+86400000;
    while(true){
     const crew=(await read(api(manniesGet)))?.mannies;
     const worker=crew?.find((m:any)=>m.id===job.mannyId);
     if(aboardReady(worker))break;
     if(!worker||!['detaching_storage_container','returning'].includes(worker.currentTask)||now()>=end)throw Error('Container placement completion could not be verified.');
     await wait(15000,signal);
    }
   }
   completed++;report({completed,status:'checking',progress:undefined,message:`${completed} craft${completed===1?'':'s'} completed.`});dispatched=false;release?.();
  }
  report({status:'done',completed,message:`Completed all ${completed} loops.`,progress:undefined});
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  report({status:dispatched?'review':signal.aborted?'queued':'blocked',completed,progress:undefined,message:dispatched?`${message} Check the game before removing and recreating remaining work; a craft may still be running.`:signal.aborted?'Stopped before the next order. Ready when you start the queue again.':message});
  throw e;
 }finally{release?.();}
}
