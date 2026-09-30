const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {planCraft,assertCraftPlan}=require('../src/lib/craft-plan.ts');
const {runCraftJob,restoreCraftQueue}=require('../src/lib/construction-queue.ts');
const {checkContainerAction,detachContainer,recoverContainer}=require('../src/lib/asteroid-containers.ts');
const {createMiningRoutine,checkMiningBatch}=require('../src/lib/mining.ts');
const {waitForDeparture}=require('../src/lib/departure-queue.ts');
const {api,probeGet,manniesGet,sectorGet,craftManny,checkCraft}=require('../src/lib/workshop.ts');
const origin={x:0,y:0,z:0},signal=new AbortController().signal;
const worker={id:'m',name:'Builder',currentTask:null,location:{type:'probe'},canReceiveOrders:true};
const recipe=(id,ingredients=[],seconds=10)=>({id,name:id,ingredients,durationSeconds:seconds,craftableBy:['manny'],output:{type:id,containerSpace:.01}});
const item=(type,quantity)=>({type,quantity,unit:'item'}),raw=(type,quantity)=>({type,quantity,unit:'earth_container_equivalent'});
const plate=recipe('plate',[raw('metals',.2)]),motor=recipe('motor',[item('plate',2)]),root=recipe('machine',[item('motor',2),item('plate',1),raw('deuterium',.1)]),recipes=[plate,motor,root];
const probe={id:1,status:'idle',sector:{relative:origin},fuel:{deuterium:100},inventory:{items:[{type:'motor'},{type:'plate'}],resourceStocks:[{type:'metals',amount:1}],containers:[],freeCapacity:9}};
(async()=>{
 let p=planCraft(root,recipes,probe);assert.equal(p.used.motor,1);assert.equal(p.used.plate,1);assert.equal(p.prepare.motor,1);assert.equal(p.prepare.plate,2);assert.equal(p.raw.metals,.4);assert.equal(p.raw.deuterium,.1);assert.equal(p.durationSeconds,40);assert.deepEqual(p.missing,{});assertCraftPlan(p,probe);checkCraft(api(craftManny,{recipe:'machine'},{mannyId:'m'}),probe,[worker],recipes,'1');
 assert.equal(probe.inventory.items.length,2,'Planning never mutates inventory');
 const scarce=structuredClone(probe);scarce.inventory.resourceStocks[0].amount=.1;p=planCraft(root,recipes,scarce);assert(Math.abs(p.missing.metals-.3)<1e-9);assert.throws(()=>assertCraftPlan(p,scarce),/Missing materials/);
 const cycle=recipe('cycle',[item('cycle',1)]);assert.throws(()=>planCraft(cycle,[cycle],probe),/cyclic/);
 const electronics={...plate,craftableBy:['atomic_3d_printer']};assert.throws(()=>assertCraftPlan(planCraft(electronics,[electronics],probe),probe),/printer/);
 const rock={id:'rock',type:'asteroid',mannyMineable:true,resourceTypes:['metals','deuterium'],resourceAmounts:{metals:5,deuterium:5}};
 const box={id:'detached-box',type:'detached_container',mode:'hidden_on_asteroid',targetObjectId:'rock',capacity:1};
 const r=createMiningRoutine(rock,'metals',1,1,[worker],'1',box);assert.equal(r.steps[0].command.body.tasks[0].payload.targetContainerId,'detached-box');checkMiningBatch(r.steps[0].command.body,[rock],[worker],[box]);assert.throws(()=>checkMiningBatch(r.steps[0].command.body,[rock],[worker],[]),/unavailable/);assert.throws(()=>createMiningRoutine(rock,'deuterium',1,1,[worker],'1',box),/deuterium/);
 let crew=[worker];const containerProbe={...probe,inventory:{...probe.inventory,containers:[{id:'aboard',kind:'container'}]}};
 const send=async c=>c.operation===probeGet?{probe:containerProbe}:c.operation===manniesGet?{mannies:crew}:c.operation===sectorGet?{sector:{relativeCoordinates:origin,objects:[rock,box]}}:Promise.reject(Error(c.operation));
 await checkContainerAction(api(detachContainer,{containerId:'aboard',mode:'hidden_on_asteroid',objectId:'rock'},{mannyId:'m'}),'1',send,origin);
 await assert.rejects(checkContainerAction(api(detachContainer,{containerId:'probe-core',mode:'hidden_on_asteroid',objectId:'rock'},{mannyId:'m'}),'1',send),/additional/);
 crew=[worker,{...worker,id:'miner',currentTask:'mining'}];await assert.rejects(checkContainerAction(api(recoverContainer,{objectId:box.id},{mannyId:'m'}),'1',send),/mining/);crew=[worker];
 let jobs=[{probeId:'1',status:'crafting'}],ticks=0,reports=[];
 await waitForDeparture({probeId:'1',origin,hours:1,signal,send,jobs:()=>jobs,isBusy:()=>false,report:m=>reports.push(m),wait:async()=>{ticks++;if(ticks===1){jobs=[];crew=[{...worker,currentTask:'returning',location:{type:'sector'}}]}else crew=[worker]}});assert.equal(ticks,2);assert(reports[0].includes('construction'));assert(reports[1].includes('Manny'));
 await assert.rejects(waitForDeparture({probeId:'1',origin,hours:1,signal,send,jobs:()=>[{probeId:'1',status:'blocked'}],isBusy:()=>false,report:()=>{}}),/attention/);
 const abort=new AbortController();await assert.rejects(waitForDeparture({probeId:'1',origin,hours:1,signal:abort.signal,send,jobs:()=>[],isBusy:()=>true,report:()=>{},wait:async()=>abort.abort()}),/cancelled/);
 await assert.rejects(waitForDeparture({probeId:'1',origin:{x:2,y:0,z:0},hours:1,signal,send,jobs:()=>[],isBusy:()=>false,report:()=>{}}),/moved/);
 let now=0;await assert.rejects(waitForDeparture({probeId:'1',origin,hours:1,signal,send,jobs:()=>[],isBusy:()=>true,report:()=>{},wait:async()=>{now+=3600000},now:()=>now}),/expired/);
 // Construct once, identify only the new container, place once, and await return.
 async function placementTest(fail=false){
  const p=structuredClone(probe);p.inventory.items=[];const m=structuredClone(worker),posts=[],states=[];let reads=0;
  const draft={id:'j',probeId:'1',recipeId:'additional_container',name:'Container',method:'manny',mannyId:'m',until:'count',count:1,completed:0,status:'queued',message:'',deployAsteroid:{id:'rock',name:'Rock',origin}};
  const send=async c=>{
   if(c.operation===probeGet)return {probe:structuredClone(p)};
   if(c.operation==='GET /api/crafting-recipes')return {recipes:[recipe('additional_container',[raw('metals',.1)])]};
   if(c.operation===sectorGet)return {sector:{relativeCoordinates:origin,objects:[rock]}};
   if(c.operation===manniesGet){if(m.currentTask&&++reads>1){if(m.currentTask==='crafting')p.inventory.containers.push({id:'new-container',kind:'container'});m.currentTask=null;m.canReceiveOrders=true;}return {mannies:[structuredClone(m)]}}
   posts.push(c);reads=0;m.canReceiveOrders=false;
   if(c.operation===craftManny)m.currentTask='crafting';else if(c.operation===detachContainer){assert.equal(c.body.containerId,'new-container');if(fail)throw Error('Unknown response');m.currentTask='detaching_storage_container'}else throw Error(c.operation);
   return {manny:structuredClone(m)};
  };
  const work=runCraftJob({job:draft,signal,send,report:p=>states.push(p),wait:async()=>{}});
  if(fail){await assert.rejects(work);assert.equal(states.at(-1).status,'review')}else {await work;assert.equal(states.at(-1).status,'done')}
  assert.deepEqual(posts.map(p=>p.operation),[craftManny,detachContainer]);assert.equal(restoreCraftQueue(JSON.stringify([{...draft,status:'crafting'}]))[0].status,'review');
 }
 await placementTest();await placementTest(true);
 console.log('PASS: recursive existing-parts-first plans, shortages/cycles/printer, container mining and guards, craft→place→return, no uncertain retry, and departure waits/cancel/timeout/changed position');
})().catch(e=>{console.error(e);process.exitCode=1});
