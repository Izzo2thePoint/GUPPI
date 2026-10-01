import {planCraft,assertCraftPlan} from './craft-plan';
import type {Command} from './engine';
export const api=(operation:string,body:unknown=null,params:Record<string,string>={}):Command=>({operation,body,params});
export const probeGet='GET /api/probe/{probeId}';
export const manniesGet='GET /api/probe/{probeId}/mannies';
export const sectorGet='GET /api/probe/{probeId}/sector';
export const craftManny='POST /api/probe/{probeId}/mannies/{mannyId}/craft';
export const craftPrinter='POST /api/probe/{probeId}/atomic-printer/craft';
export const label=(value:unknown)=>String(value??'Unknown').replaceAll('_',' ');
export const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:6}):'—';
export const aboardReady=(m:any)=>m?.location?.type==='probe'&&m.currentTask===null&&m.canReceiveOrders===true;
export function ingredientStock(inventory:any,ingredient:any):number|null{
 if(ingredient.type==='deuterium')return null;
 if(ingredient.unit==='item')return Array.isArray(inventory?.items)?inventory.items.filter((x:any)=>x.type===ingredient.type).length:null;
 if(ingredient.unit==='earth_container_equivalent')return Array.isArray(inventory?.resourceStocks)?inventory.resourceStocks.filter((x:any)=>x.type===ingredient.type).reduce((n:number,x:any)=>n+(Number.isFinite(x.amount)?x.amount:0),0):null;
 return null;
}
export function checkCraft(command:Command,probe:any,mannies:any[],recipes:any[],probeId:string){
 if(![craftManny,craftPrinter].includes(command.operation))throw Error('Choose a documented crafting action.');
 if(!probe||String(probe.id)!==probeId||!probe.inventory||['out_of_scut_range','dead','disabled','trapped_by_black_hole'].includes(probe.status))throw Error('Refresh the selected probe. Full inventory and control must be available to craft.');
 const recipe=recipes.find(r=>r.id===(command.body as any)?.recipe),printer=command.operation===craftPrinter;
 if(!recipe||!Array.isArray(recipe.craftableBy)||!recipe.craftableBy.includes(printer?'atomic_3d_printer':'manny'))throw Error('This recipe is not available for the selected crafter. Refresh recipes.');
 if(!Array.isArray(mannies))throw Error('Manny status is unavailable.');
 if(printer){if(!probe.inventory.items?.some((i:any)=>i.type==='atomic_3d_printer'))throw Error('No atomic printer is aboard.');if(!mannies.some(aboardReady))throw Error('The printer needs an idle Manny aboard as its assistant.');}
 else if(!mannies.some(m=>String(m.id)===command.params.mannyId&&aboardReady(m)))throw Error('The selected Manny must be aboard, idle, and able to receive orders.');
 assertCraftPlan(planCraft(recipe,recipes,probe),probe);
 return recipe;
}
export function messageBody(type:string,id:string,body:string){
 id=id.trim();
 if(!['probe','planet'].includes(type))throw Error('Choose a probe or planet recipient.');
 if(!body.trim()||body.length>2000)throw Error('Write a message of 1–2,000 characters.');
 if(type==='probe'&&(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1))throw Error('Enter a positive probe ID.');
 if(type==='planet'&&(!id.trim()||id.length>200))throw Error('Enter the planet’s object ID.');
 return {recipient:{type,id:type==='probe'?Number(id):id.trim()},body};
}
