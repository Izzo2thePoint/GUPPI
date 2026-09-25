import type {Command} from './engine';
import {upgradeProbe,blueprintList,upgradeProblem} from './engineering';
import {api,probeGet,manniesGet,sectorGet,aboardReady,ingredientStock} from './workshop';
import {asteroids,detachedContainers} from './asteroid-containers';
import {isCoord,coordKey,hops,type Coord} from './navigation';
export const repairProbe='POST /api/probe/{probeId}/mannies/{mannyId}/repair';
export const motorizeAsteroid='POST /api/probe/{probeId}/mannies/{mannyId}/motorize-asteroid';
export const refuelAsteroid='POST /api/probe/{probeId}/mannies/{mannyId}/refuel-motorized-asteroid';
export const launchAsteroid='POST /api/probe/{probeId}/asteroids/{asteroidId}/trajectories';
export const trajectoryGet='GET /api/probe/{probeId}/asteroid-trajectories/{trajectoryId}';
export const improvementsGet='GET /api/probe/{probeId}/probe-improvements-available';
export const probeOperations=[repairProbe,motorizeAsteroid,refuelAsteroid,launchAsteroid,upgradeProbe];
export function repairEstimate(percent:number){if(!Number.isFinite(percent)||percent<=0||percent>100)throw Error('Choose an integrity increase above 0 and at most 100 percentage points.');return {percent,metals:Number((percent*.01).toFixed(6)),seconds:percent*600};}
export function repairCommand(mannyId:string,percent:number){repairEstimate(percent);if(!mannyId)throw Error('Choose a repair Manny.');return api(repairProbe,{integrityPercent:percent},{mannyId});}
export function transferCommand(asteroidId:string,origin:Coord,target:Coord){if(!asteroidId||!isCoord(origin)||!isCoord(target)||hops(origin,target)!==1)throw Error('Choose one of the 12 adjacent sectors as the transfer direction.');return api(launchAsteroid,{mode:'sector_transfer',target},{asteroidId});}
export const trajectoryActive=(t:any)=>!!t&&!['complete','completed','captured','impacted','destroyed','failed','expired','lost','escaped'].includes(t.status);
export async function checkProbeOperation(c:Command,id:string,send:(c:Command)=>Promise<any>){
 const p=(await send(api(probeGet)))?.probe,m=(await send(api(manniesGet)))?.mannies,b=c.body as any;
 if(String(p?.id)!==id||!p.inventory||!Array.isArray(m)||!['idle','orbiting'].includes(p.status))throw Error('Fresh telemetry from a stationary probe is required.');
 if(c.operation!==launchAsteroid&&!m.some((x:any)=>String(x.id)===c.params.mannyId&&aboardReady(x)))throw Error('Choose an idle Manny aboard this probe.');
 if(c.operation===upgradeProbe){const improvements=(await send(api(blueprintList)))?.improvements;upgradeProblem(improvements?.find((i:any)=>i.id===b?.improvement),p,m,c.params.mannyId);return;}
 if(c.operation===repairProbe){const e=repairEstimate(b?.integrityPercent),integrity=p.systems?.integrityPercent;if(!Number.isFinite(integrity)||integrity<0||integrity>100||integrity+e.percent>100+1e-9)throw Error('The repair would exceed 100% integrity. Refresh and reduce the amount.');if(m.some((x:any)=>x.currentTask==='repair'))throw Error('A repair is already active. Wait for it to finish before adding more integrity.');const stock=ingredientStock(p.inventory,{type:'metals',unit:'earth_container_equivalent'});if(stock===null||stock+1e-9<e.metals)throw Error('Not enough metals for this repair.');return;}
 const s=await send(api(sectorGet));
 if(!isCoord(p.sector?.relative)||!isCoord(s?.sector?.relativeCoordinates)||coordKey(p.sector.relative)!==coordKey(s.sector.relativeCoordinates))throw Error('The current asteroid sector could not be verified.');
 const rock=asteroids(s).find(r=>String(r.id)===String(c.params.asteroidId||b?.objectId));if(!rock)throw Error('That asteroid is no longer available. Refresh; installing an engine changes its ID.');
 if(trajectoryActive(rock.trajectory))throw Error('This asteroid already has an active trajectory.');
 const boxes=detachedContainers(s).filter(x=>x.targetObjectId===rock.id).map(x=>String(x.id));
 if(m.some((x:any)=>x.currentTask&&(x.task?.objectId===rock.id||x.task?.target?.id===rock.id||boxes.includes(String(x.task?.targetContainer?.id)))))throw Error('A Manny is working on this asteroid or its container. Finish that work before moving or modifying it.');
 if(c.operation===motorizeAsteroid){
  if(rock.motorized===true)throw Error('This asteroid already has an engine.');
  const improvements=(await send(api(improvementsGet)))?.improvements;if(!Array.isArray(improvements)||!improvements.some((i:any)=>i.id==='distributed_thrust_anchoring'&&i.available===true))throw Error('The Distributed Thrust Anchoring blueprint is required.');
  for(const [type,count] of [['deuterium_engine',1],['steel_bar',4],['steel_plate',2]] as const)if((ingredientStock(p.inventory,{type,unit:'item'})??-1)<count)throw Error(`Motorization needs ${count} ${type.replaceAll('_',' ')}.`);
 }else if(rock.motorized!==true)throw Error('Install an engine on this asteroid first.');
 if([motorizeAsteroid,refuelAsteroid].includes(c.operation)&&(!Number.isFinite(p.fuel?.deuterium)||p.fuel.deuterium<.2))throw Error('At least 0.2 deuterium tank points are required.');
 if(c.operation===refuelAsteroid&&rock.motorFuelStatus!=='empty')throw Error('Refueling requires an empty asteroid tank.');
 if(c.operation===launchAsteroid){if(rock.motorFuelStatus!=='full')throw Error('Refuel the asteroid before launch.');if(b?.mode!=='sector_transfer')throw Error('Use a sector transfer to relocate the asteroid.');transferCommand(rock.id,p.sector.relative,b?.target);}
}
