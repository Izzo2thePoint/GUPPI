const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createTaskCoordinator,commandClaims,TaskConflictError}=require('../src/lib/task-coordinator.ts');
const {repairEstimate,repairCommand,transferCommand,motorizeAsteroid,refuelAsteroid,checkProbeOperation,improvementsGet}=require('../src/lib/probe-operations.ts');
const {api,probeGet,manniesGet,sectorGet,craftManny}=require('../src/lib/workshop.ts');
const {neighbors}=require('../src/lib/navigation.ts');
const {runCraftJob}=require('../src/lib/construction-queue.ts');
const {createRequestQueue}=require('../src/lib/manny-telemetry.ts');
const {executeWorkshopAction}=require('../src/lib/workshop-actions.ts');
const ready=id=>({id,location:{type:'probe'},canReceiveOrders:true,currentTask:null});
function fixture(){
 const probe={id:1,status:'idle',sector:{relative:{x:0,y:0,z:0}},systems:{integrityPercent:70},fuel:{deuterium:1},inventory:{freeCapacity:10,items:['deuterium_engine',...Array(4).fill('steel_bar'),...Array(2).fill('steel_plate')].map((type,i)=>({id:String(i),type})),resourceStocks:[{type:'metals',amount:1}]}};
 const crew=[ready('a'),ready('b')],rock={id:'rock',type:'asteroid',name:'Rock',motorized:false};let blueprint=true;
 const send=async c=>c.operation===probeGet?{probe}:c.operation===manniesGet?{mannies:crew}:c.operation===sectorGet?{sector:{relativeCoordinates:{x:0,y:0,z:0},objects:[rock]}}:c.operation===improvementsGet?{improvements:[{id:'distributed_thrust_anchoring',available:blueprint}]}:Promise.reject(Error(c.operation));
 return {probe,crew,rock,send,setBlueprint:v=>blueprint=v};
}
async function parallel(same=false,fail=false){
 const co=createTaskCoordinator(),queue=createRequestQueue(),crew=[ready('a'),ready('b')],events=[],states={};let accepted=0;
 const recipe={id:'steel_bar',durationSeconds:60,craftableBy:['manny'],ingredients:[{type:'metals',unit:'earth_container_equivalent',quantity:.1}],output:{type:'steel_bar',containerSpace:.1}};
 const probe={id:1,status:'idle',inventory:{freeCapacity:10,items:[],resourceStocks:[{type:'metals',amount:1}]}};
 const send=async c=>{
  if(c.operation===probeGet)return {probe:structuredClone(probe)};
  if(c.operation===manniesGet)return {mannies:structuredClone(crew)};
  if(c.operation==='GET /api/crafting-recipes')return {recipes:[recipe]};
  if(c.operation===craftManny){const m=crew.find(m=>m.id===c.params.mannyId);assert.equal(m.currentTask,null);events.push('start:'+m.id);accepted++;if(fail&&m.id==='a')throw Error('Uncertain response');m.currentTask='crafting';m.canReceiveOrders=false;probe.inventory.resourceStocks[0].amount-=.1;return {manny:structuredClone(m)}}
  throw Error(c.operation);
 };
 const jobs=['a',same?'a':'b'].map((id,i)=>{const t=co.begin('Craft '+i,'1');return runCraftJob({job:{id:String(i),probeId:'1',recipeId:'steel_bar',name:'Bar',method:'manny',mannyId:id,until:'count',count:1,completed:0,status:'queued',message:''},signal:t.controller.signal,send,report:p=>states[i]={...states[i],...p},reserve:c=>co.acquire(t,c),release:()=>co.setClaims(t,[]),execute:(c,p,s)=>queue(()=>executeWorkshopAction(c,p,s,extra=>co.setClaims(t,[...t.claims,...extra])),t.controller.signal),wait:async()=>{if(!same)while(accepted<2)await new Promise(r=>setTimeout(r,1));events.push('finish:'+id);Object.assign(crew.find(m=>m.id===id),ready(id));}}).then(()=>co.finish(t),e=>{co.finish(t,e);throw e})});
 const results=await Promise.allSettled(jobs);
 assert.equal(accepted,2,'Two requested orders, no uncertain retries');
 if(same)assert.deepEqual(events,['start:a','finish:a','start:a','finish:a']);
 else assert(events.indexOf('start:b')<events.indexOf('finish:b')&&events.slice(0,2).every(e=>e.startsWith('start:')),'Different Mannys accept before completion');
 if(fail){assert.equal(results[0].status,'rejected');assert.equal(states[0].status,'review');assert.equal(states[1].status,'done')}else assert(results.every(r=>r.status==='fulfilled'));
}
(async()=>{
 assert.deepEqual(repairEstimate(2),{percent:2,metals:.02,seconds:1200});for(const n of [0,-1,101,NaN])assert.throws(()=>repairEstimate(n));
 let f=fixture();await checkProbeOperation(repairCommand('a',30),'1',f.send);await assert.rejects(checkProbeOperation(repairCommand('a',31),'1',f.send),/exceed/);f.probe.inventory.resourceStocks[0].amount=0;await assert.rejects(checkProbeOperation(repairCommand('a',2),'1',f.send),/metals/);
 f=fixture();f.crew[1].currentTask='repair';await assert.rejects(checkProbeOperation(repairCommand('a',2),'1',f.send),/already active/);f.crew[0].canReceiveOrders=false;await assert.rejects(checkProbeOperation(repairCommand('a',2),'1',f.send),/idle Manny/);
 const motor=api(motorizeAsteroid,{objectId:'rock'},{mannyId:'a'}),refuel=api(refuelAsteroid,{objectId:'rock'},{mannyId:'a'});
 f=fixture();await checkProbeOperation(motor,'1',f.send);f.setBlueprint(false);await assert.rejects(checkProbeOperation(motor,'1',f.send),/blueprint/);f.setBlueprint(true);f.probe.fuel.deuterium=.19;await assert.rejects(checkProbeOperation(motor,'1',f.send),/tank points/);
 f=fixture();f.probe.inventory.items.pop();await assert.rejects(checkProbeOperation(motor,'1',f.send),/steel plate/);f=fixture();f.rock.motorized=true;f.rock.motorFuelStatus='empty';await checkProbeOperation(refuel,'1',f.send);f.rock.motorFuelStatus='full';await assert.rejects(checkProbeOperation(refuel,'1',f.send),/empty/);
 for(const target of neighbors({x:0,y:0,z:0}))await checkProbeOperation(transferCommand('rock',{x:0,y:0,z:0},target),'1',f.send);
 assert.throws(()=>transferCommand('rock',{x:0,y:0,z:0},{x:4,y:0,z:0}),/adjacent/);const transfer=transferCommand('rock',{x:0,y:0,z:0},{x:1,y:1,z:0});f.crew[1].currentTask='mining';f.crew[1].task={objectId:'rock'};await assert.rejects(checkProbeOperation(transfer,'1',f.send),/working/);f.crew[1]=ready('b');f.rock.trajectory={status:'active'};await assert.rejects(checkProbeOperation(transfer,'1',f.send),/trajectory/);delete f.rock.trajectory;f.rock.id='new-rock';await assert.rejects(checkProbeOperation(transfer,'1',f.send),/no longer/);
 const co=createTaskCoordinator(),a=co.begin('Mining A','1',[{key:'manny:a'},{key:'asteroid:rock',shared:true}]),b=co.begin('Mining B','1',[{key:'manny:b'},{key:'asteroid:rock',shared:true}]);
 assert.throws(()=>co.begin('Duplicate','1',[{key:'manny:a'}]),TaskConflictError);assert.throws(()=>co.assert('1',commandClaims(motor)),TaskConflictError);co.assert('1',commandClaims(api(probeGet)));co.begin('Other probe','2',[{key:'manny:a'}]);assert.throws(()=>co.assert('1',[{key:'probe'}]),TaskConflictError);a.controller.abort();co.finish(a,Error('Stopped'));assert.equal(b.state,'running');assert.deepEqual(co.reservedMannies('1'),['b']);assert.throws(()=>co.guardAutoBuilder('1',[ready('b')]),TaskConflictError);co.finish(b);co.guardAutoBuilder('1',[ready('b')]);
 co.begin('Printer','1',[{key:'printer'}]);assert.throws(()=>co.begin('Another printer job','1',[{key:'printer'}]),TaskConflictError);
 const batch=commandClaims(api('POST /api/probe/{probeId}/mannies/tasks',{tasks:[{mannyId:'a',task:'mine',payload:{objectId:'rock',targetContainerId:'box'}}]}));assert(batch.some(c=>c.key==='container:box'&&c.shared));assert(batch.some(c=>c.key==='manny:a'));
 await parallel();await parallel(true);await parallel(false,true);
 console.log('PASS: repairs, blueprint/material/fuel checks, 12 asteroid directions, target changes, resource conflicts, simultaneous crafts, shared-worker serialization, independent failure and no uncertain retries');
})().catch(e=>{console.error(e);process.exitCode=1});
