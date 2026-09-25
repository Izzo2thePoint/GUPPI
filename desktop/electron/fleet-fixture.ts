import assert from 'node:assert/strict';
export function fleetFixture(base:any,sector:any){
 const home={...structuredClone(base),name:'Fleet Builder'},explorer={...structuredClone(base),id:2,name:'Fleet Explorer',status:'cruising',sector:{relative:{x:2,y:0,z:0}},fuel:{deuterium:77},systems:{integrityPercent:55},movement:{status:'cruising',origin:{x:2,y:0,z:0},target:{x:4,y:0,z:0},estimatedVelocityC:.75,arrivalAt:new Date(Date.now()+3600000).toISOString()}},remote={id:3,name:'Remote Probe',status:'out_of_scut_range',isReachable:false,sector:{relative:{x:4,y:2,z:0}}},miner={...structuredClone(base),id:4,name:'Fleet Miner'};
 const probes:any[]=[home,explorer,remote,miner];let failSensors=true;
 const crew=(id:string)=>id==='1'?[{id:'builder-manny',name:'Builder Manny',currentTask:'crafting',canReceiveOrders:false,location:{type:'probe'},taskProgressPercent:35}]:id==='4'?[{id:'miner-manny',name:'Miner Manny',currentTask:'mining',canReceiveOrders:false,location:{type:'sector'},taskProgressPercent:60}]:[{id:'explorer-manny',name:'Explorer Manny',currentTask:null,canReceiveOrders:true,location:{type:'probe'}}];
 return {probes,releaseSensors(){failSensors=false},async handle(u:URL,init:RequestInit):Promise<Response|null>{
  if(u.pathname==='/api/probes')return Response.json({probes:probes.map(p=>({id:p.id,name:p.name,status:p.status,isReachable:p.id!==3,sector:p.sector}))});
  const id=u.pathname.match(/^\/api\/probe\/(\d+)(?:\/|$)/)?.[1];if(!id)return null;const p=probes.find(p=>String(p.id)===id);if(!p)return null;
  assert.equal(init.method,'GET','Fleet fixture issues no mutations');
  if(u.pathname==='/api/probe/'+id)return Response.json({probe:p});
  if(u.pathname.endsWith('/mannies')){assert.notEqual(id,'3','Unreachable crew is not requested');return Response.json({mannies:crew(id)})}
  if(u.pathname.endsWith('/sector')){if(id==='4'&&failSensors)return Response.json({error:{code:'sensors_unavailable',message:'Fixture sensor failure'}},{status:400});return Response.json({sector:{...sector,relativeCoordinates:p.sector.relative}})}
  if(u.pathname.endsWith('/visited-sectors'))return Response.json({visitedSectors:[{relativeCoordinates:p.sector.relative,firstVisitedAt:'2026-09-01T00:00:00Z',lastVisitedAt:'2026-09-10T00:00:00Z'},{relativeCoordinates:{x:Number(id)*2,y:0,z:0},firstVisitedAt:'2026-09-01T00:00:00Z',lastVisitedAt:'2026-09-10T00:00:00Z'}]});
  return null;
 }};
}
