import {pause,type Command} from './engine';
import {coordKey,danger,hops,isCoord,neighbors,routeDistance,systemHopLimit,type Coord} from './navigation';
import {departureCrew,type LeaveCrew} from './remote-mining';

export type RouteProgress={status:'waiting'|'checking'|'scanning'|'moving'|'complete'|'stopped'|'error';completed:number;total:number;target?:Coord;message:string};
type Options={path:Coord[];probeId:string;maxWaitHours:number;maxHop?:number;scanNeighbors?:boolean;leaveCrew?:LeaveCrew[];signal:AbortSignal;send:(command:Command)=>Promise<any>;report:(progress:RouteProgress)=>void;wait?:(ms:number,signal:AbortSignal)=>Promise<void>;now?:()=>number};
const moving=new Set(['preparing','accelerating','cruising','decelerating']);
const stationary=new Set(['idle','orbiting']);
const same=(a:unknown,b:Coord)=>isCoord(a)&&coordKey(a)===coordKey(b);
const command=(operation:string,body:unknown=null,params:Record<string,string>={}):Command=>({operation,body,params});

export function validateRoute(path:Coord[],maxHop=200):void{
 systemHopLimit(maxHop);
 if(!Array.isArray(path)||path.length<2||path.length>201)throw Error('A launch requires 1–200 neighboring-sector hops.');
 if(path.some(p=>!isCoord(p)))throw Error('The route contains invalid coordinates.');
 for(let i=1;i<path.length;i++)if(hops(path[i-1],path[i])<1||hops(path[i-1],path[i])>maxHop)throw Error(`Every jump must span 1–${maxHop} neighboring sectors (System Hop).`);
 if(routeDistance(path)>200)throw Error('A route can span at most 200 neighboring-sector hops in total.');
}
export function joinRoutes(legs:Coord[][]):Coord[]{
 const path:Coord[]=[];
 for(const leg of legs){validateRoute(leg);if(path.length&&!same(path[path.length-1],leg[0]))throw Error('The next course must start at the previous course’s destination.');path.push(...leg.slice(path.length?1:0).map(p=>({...p})));}
 if(path.length)validateRoute(path);
 return path;
}

function telemetry(data:any,id:string){
 const p=data?.probe;
 if(!p||String(p.id)!==id)throw Error('The selected probe could not be verified.');
 if(!stationary.has(p.status)&&!moving.has(p.status))throw Error(`Probe cannot continue: ${p.status||'status unavailable'}.`);
 if(!Number.isFinite(p.fuel?.deuterium)||p.fuel.deuterium<0||!Number.isFinite(p.systems?.integrityPercent))throw Error('Full probe telemetry is unavailable. Refresh the probe before launching again.');
 if(p.movement!=null&&!moving.has(p.movement.status)&&p.movement.status!=='arrived')throw Error(`Movement cannot continue: ${p.movement.status||'unknown state'}.`);
 return p;
}
function ready(p:any,origin:Coord){
 if(!stationary.has(p.status)||moving.has(p.movement?.status))throw Error('Departure requires an idle or orbiting probe with no active movement.');
 if(!same(p.sector?.relative,origin))throw Error(`Probe position changed. This hop must start at ${coordKey(origin)}. Replot from the current sector.`);
 if(p.systems.integrityPercent<10)throw Error('Departure requires at least 10% probe integrity.');
 if(p.fuel.deuterium<=0)throw Error('No deuterium available. Refuel before continuing. The game checks the exact cost of each jump.');
}
function crew(data:any,leave:LeaveCrew[]=[]){
 if(!Array.isArray(data?.mannies))throw Error('Manny telemetry is unavailable.');
 if(departureCrew(data.mannies,leave).length)throw Error('All Mannys except the reviewed outpost crews must be aboard, either idle or crafting, before departure. Finish or recall their tasks before launching.');
}

/** Commands are dispatched once. An uncertain response always stops subsequent hops. */
export async function runRoute(options:Options):Promise<void>{
 const {probeId,signal,send,report,maxWaitHours}=options;
 const path=structuredClone(options.path),wait=options.wait||pause,now=options.now||Date.now;
 let completed=0,target:Coord|undefined;
 const emit=(status:RouteProgress['status'],message:string)=>report({status,completed,total:Math.max(0,path.length-1),target,message});
 const check=()=>{if(signal.aborted)throw Error('Stopped');};
 const call=async(c:Command)=>{check();const data=await send(c);check();return data;};
 const read=async()=>telemetry(await call(command('GET /api/probe/{probeId}')),probeId);
 try{
  validateRoute(path,options.maxHop??1);
  if(!probeId)throw Error('Select a probe before launching.');
  if(!Number.isFinite(maxWaitHours)||maxWaitHours<1||maxWaitHours>168)throw Error('Set a maximum wait of 1–168 hours per hop.');
  for(let i=1;i<path.length;i++){
   const origin=path[i-1];target=path[i];const deadline=now()+maxWaitHours*3600000;
   const timeCheck=()=>{check();if(now()>=deadline)throw Error(`Hop ${i} timed out. Check the probe before launching again; accepted movement continues in the game.`);};
   const waitTick=async()=>{timeCheck();await wait(Math.min(15000,deadline-now()),signal);timeCheck();};
   emit('checking',`Checking departure for hop ${i} of ${path.length-1}.`);
   ready(await read(),origin);crew(await call(command('GET /api/probe/{probeId}/mannies')),options.leaveCrew);
   // Passive sensors may need residence time after arriving at each sector.
   while(true){
    timeCheck();emit('scanning',`Checking sensors for ${coordKey(target)}.`);
    let sector:any;
    try{sector=(await call(command('GET /api/sector',null,{x:String(target.x),y:String(target.y),z:String(target.z)})))?.sector;}
    catch(e){if(!signal.aborted&&/insufficient_scan_data|sensors_unavailable/.test((e as any)?.code||'')||!signal.aborted&&/insufficient_scan_data/.test(e instanceof Error?e.message:'')){emit('scanning','Waiting for passive sensors to gather enough data.');await waitTick();ready(await read(),origin);continue;}throw e;}
    if(!sector||!same(sector.relativeCoordinates,target))throw Error('The destination scan could not be verified.');
    if(sector.dataFreshness==='historical'||sector.dataFreshness==='unavailable'||sector.sensorMode==='blind')throw Error('Live destination sensor data is unavailable. Route stopped before departure.');
    if(danger(sector))throw Error(`Reported navigation hazard at ${coordKey(target)}. Inspect the sector and plot another course.`);
    const scan=sector.scan;
    if(!Number.isFinite(scan?.requiredResidenceSeconds)||!Number.isFinite(scan?.currentSectorResidenceSeconds)||!Number.isFinite(scan?.scanQuality))throw Error('Destination scan readiness is unavailable. Route stopped before departure.');
    if(scan.currentSectorResidenceSeconds>=scan.requiredResidenceSeconds&&scan.scanQuality>0)break;
    emit('scanning','Waiting for passive sensors to gather enough data.');await waitTick();ready(await read(),origin);
   }
   timeCheck();emit('checking',`Final probe and Manny checks before hop ${i}.`);
   ready(await read(),origin);crew(await call(command('GET /api/probe/{probeId}/mannies')),options.leaveCrew);timeCheck();
   emit('moving',`Sending movement to ${coordKey(target)}. Waiting for game confirmation.`);
   const accepted=await call(command('POST /api/probe/{probeId}/move',{target:{...target}}));
   const movement=accepted?.movement;
   if(!movement||!moving.has(movement.status)||!same(movement.target,target)||!same(movement.origin,origin))throw Error('Movement acceptance could not be verified. Check the game before retrying; a jump may already be underway.');
   emit('moving',`Hop ${i} accepted. Waiting for confirmed arrival at ${coordKey(target)}.`);
   while(true){
    timeCheck();const p=await read();timeCheck();
    if(p.movement&&(!same(p.movement.target,target)||!same(p.movement.origin,origin)))throw Error('Movement differs from the launched route. Future jumps stopped.');
    if(stationary.has(p.status)&&!moving.has(p.movement?.status)){
     if(!same(p.sector?.relative,target))throw Error('The probe stopped outside the expected destination. Future jumps stopped.');
     break;
    }
    if(!moving.has(p.status)||!p.movement||!moving.has(p.movement.status))throw Error('Movement telemetry is inconsistent. Future jumps stopped.');
    emit('moving',`Hop ${i} · ${p.status}. Waiting for arrival at ${coordKey(target)}.`);await waitTick();
   }
   completed=i;
   if(options.scanNeighbors!==false){
    const points=neighbors(target),scanDeadline=now()+maxWaitHours*3600000;
    for(let n=0;n<points.length;n++)while(true){
     check();if(now()>=scanDeadline)throw Error('Neighbor scan timed out. Future jumps stopped.');
     const arrived=await read();if(!stationary.has(arrived.status)||moving.has(arrived.movement?.status)||!same(arrived.sector?.relative,target))throw Error('Probe moved during arrival scans.');const point=points[n];emit('scanning',`Arrived at ${coordKey(target)}. Scanning neighbor ${n+1}/${points.length}: ${coordKey(point)}.`);
     let s:any;try{s=(await call(command('GET /api/sector',null,{x:String(point.x),y:String(point.y),z:String(point.z)})))?.sector;}
     catch(e){if(!signal.aborted&&(/insufficient_scan_data|sensors_unavailable/.test((e as any)?.code||'')||/insufficient_scan_data/.test((e as Error).message))){await wait(Math.min(15000,Math.max(1,scanDeadline-now())),signal);continue;}throw e;}
     if(!s||!same(s.relativeCoordinates,point)||s.dataFreshness==='historical'||s.dataFreshness==='unavailable'||s.sensorMode==='blind')throw Error('A neighbor scan did not return current observations.');
     const scan=s.scan;if(!Number.isFinite(scan?.scanQuality)||!Number.isFinite(scan?.requiredResidenceSeconds)||!Number.isFinite(scan?.currentSectorResidenceSeconds))throw Error('Neighbor scan readiness is unavailable.');
     if(scan.scanQuality>0&&scan.currentSectorResidenceSeconds>=scan.requiredResidenceSeconds)break;
     await wait(Math.min(15000,Math.max(1,scanDeadline-now())),signal);
    }
   }
   emit(i===path.length-1?'complete':'checking',i===path.length-1?`Arrived at ${coordKey(target)}. All ${completed} hops${options.scanNeighbors!==false?' and arrival neighbor scans':''} complete.`:`Arrived at ${coordKey(target)}. Preparing the next hop.`);
  }
 }catch(e){const message=signal.aborted?'Future jumps stopped. Any accepted jump continues in the game. Refresh the probe and replot before launching again.':`${e instanceof Error?e.message:String(e)} No further jumps will be sent.`;emit(signal.aborted?'stopped':'error',message);throw Error(message);}
}
