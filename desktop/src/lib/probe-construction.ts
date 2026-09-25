import type {Command} from './engine';
import {aboardReady} from './workshop';
export const assembleProbe='POST /api/probe/{probeId}/mannies/{mannyId}/assemble-probe';
export type ProbeModel='generic'|'deuterium_tanker';
export const modelName=(model:string)=>model==='deuterium_tanker'?'Deuterium tanker':'Standard probe';
export function assemblyParts(model:ProbeModel){return {deuterium_engine:1,scut_relay:1,electric_motor:5,atomic_printer_part:2,solar_panel:4,...(model==='deuterium_tanker'?{steel_plate:10,linear_actuator:2,integrated_circuit:1}:{})} as Record<string,number>}
export function emptyContainers(inventory:any):any[]{return (Array.isArray(inventory?.containers)?inventory.containers:[]).filter((c:any)=>c.kind==='container'&&typeof c.id==='string'&&c.usedCapacity===0)}
export function assemblyStock(inventory:any,type:string){return Array.isArray(inventory?.items)?inventory.items.filter((i:any)=>i.type===type).length:0}
export function checkAssembly(command:Command,probe:any,mannies:any[],probeId:string){
 if(command.operation!==assembleProbe)throw Error('Choose the probe assembly command.');
 if(String(probe?.id)!==probeId||!probe?.inventory||!['idle','orbiting'].includes(probe.status))throw Error('The parent probe must be stationary with current inventory available.');
 if(!Array.isArray(mannies)||!mannies.some(m=>String(m.id)===command.params.mannyId&&aboardReady(m)))throw Error('Choose an idle Manny aboard this probe.');
 const body=command.body as any;if(!body||!['generic','deuterium_tanker'].includes(body.model))throw Error('Choose a supported probe model.');
 const ids=body.containerIds;if(!Array.isArray(ids)||ids.length!==2||ids.some(id=>typeof id!=='string')||new Set(ids).size!==2)throw Error('Choose two different empty additional containers.');
 const containers=emptyContainers(probe.inventory);if(ids.some(id=>!containers.some(c=>c.id===id)))throw Error('Both selected containers must still be empty additional containers aboard this probe.');
 for(const [type,required] of Object.entries(assemblyParts(body.model)))if(assemblyStock(probe.inventory,type)<required)throw Error(`Not enough ${type.replaceAll('_',' ')}: need ${required}.`);
 return body;
}
