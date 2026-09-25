const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {runCraftJob,restoreCraftQueue,cargoStop}=require('../src/lib/construction-queue.ts');
const {plotCourse,hops,coordKey,routeDistance}=require('../src/lib/navigation.ts');
const {validateRoute,joinRoutes,runRoute}=require('../src/lib/route-launch.ts');
const {craftManny,craftPrinter}=require('../src/lib/workshop.ts');
const draft={id:'j',probeId:'1',recipeId:'part',name:'Test part',method:'manny',mannyId:'m',until:'count',count:3,completed:0,status:'queued',message:''};
function fixture({free=10,fail=false,changeTask=false,missing=false,printer=false,stop=false}={}){
 const signal=new AbortController(),events=[],states=[],mann={id:'m',location:{type:'probe'},canReceiveOrders:true,currentTask:null};let reads=0,posts=0,used=0;
 const recipe={id:'part',durationSeconds:60,craftableBy:['manny','atomic_3d_printer'],ingredients:[{type:'metals',unit:'earth_container_equivalent',quantity:0.1}],output:{containerSpace:0.2}};
 const probe={id:1,status:'idle',inventory:{freeCapacity:free,items:printer?[{id:'printer',type:'atomic_3d_printer'}]:[],resourceStocks:[{type:'metals',amount:missing?0:5}]}};
 const send=async c=>{events.push(c.operation);
  if(c.operation==='GET /api/probe/{probeId}')return {probe:structuredClone(probe)};
  if(c.operation==='GET /api/crafting-recipes')return {recipes:[recipe]};
  if(c.operation==='GET /api/probe/{probeId}/inventory/{itemId}')return {item:{id:'printer',type:'atomic_3d_printer',currentTask:null}};
  if(c.operation==='GET /api/probe/{probeId}/mannies'){
   if(mann.currentTask&&++reads>=2){mann.currentTask=changeTask?'mining':null;mann.canReceiveOrders=!changeTask;probe.inventory.freeCapacity-=.2;used++}
   return {mannies:[structuredClone(mann)]};
  }
  if([craftManny,craftPrinter].includes(c.operation)){assert.equal(mann.currentTask,null,'No overlapping craft orders');posts++;reads=0;if(fail)throw Error('Uncertain response');mann.currentTask=printer?'assisting_atomic_printer':'crafting';mann.canReceiveOrders=false;return {manny:structuredClone(mann)}}
  throw Error(c.operation);
 };
 return {signal,events,states,get posts(){return posts},get used(){return used},options:{signal:signal.signal,send,report:p=>states.push(p),wait:async()=>{if(stop)signal.abort()}}};
}
(async()=>{
 let f=fixture();await runCraftJob({...f.options,job:draft});assert.equal(f.posts,3);assert.equal(f.used,3);assert.equal(f.states.at(-1).status,'done');assert.equal(f.states.at(-1).completed,3);
 f=fixture({free:.45});await runCraftJob({...f.options,job:{...draft,until:'full'}});assert.equal(f.posts,2);assert.match(f.states.at(-1).message,/no room/);
 f=fixture({free:0});await runCraftJob({...f.options,job:{...draft,until:'full'}});assert.equal(f.posts,0);
 f=fixture({printer:true});await runCraftJob({...f.options,job:{...draft,method:'atomic_3d_printer',mannyId:'',count:2}});assert.equal(f.posts,2);
 for(const variant of [{fail:true},{changeTask:true},{stop:true}]){f=fixture(variant);await assert.rejects(runCraftJob({...f.options,job:draft}));assert.equal(f.posts,1);assert.equal(f.states.at(-1).status,'review')}
 f=fixture({missing:true});await assert.rejects(runCraftJob({...f.options,job:draft}));assert.equal(f.posts,0);assert.equal(f.states.at(-1).status,'blocked');
 f=fixture();f.signal.abort();await assert.rejects(runCraftJob({...f.options,job:draft}));assert.equal(f.posts,0);
 assert.throws(()=>cargoStop({},{}));assert.equal(restoreCraftQueue(JSON.stringify([{...draft,status:'crafting'}]))[0].status,'review');assert.equal(restoreCraftQueue(JSON.stringify([draft]))[0].status,'queued');
 f=fixture();await assert.rejects(runCraftJob({...f.options,job:draft,report:p=>{if(p.status==='crafting')throw Error('Disk full')}}));assert.equal(f.posts,0,'No order without saved dispatch checkpoint');
 const origin={x:0,y:0,z:0};for(let x=-8;x<=8;x++)for(let y=-8;y<=8;y++)for(let z=-4;z<=4;z++){if((x+y+z)%2)continue;const to={x,y,z};for(const max of [1,2,3,7,200]){const path=plotCourse(origin,to,max);assert.equal(coordKey(path.at(-1)),coordKey(to));assert.equal(routeDistance(path),hops(origin,to));assert.equal(path.length-1,Math.ceil(hops(origin,to)/max));for(let i=1;i<path.length;i++)assert(hops(path[i-1],path[i])<=max);if(path.length>1)validateRoute(path,max)}}
 for(const max of [0,-1,1.5,201,NaN])assert.throws(()=>plotCourse(origin,{x:2,y:0,z:0},max));
 const path=plotCourse(origin,{x:6,y:0,z:0},2);assert.throws(()=>validateRoute(path,1));assert.equal(joinRoutes([path,plotCourse(path.at(-1),{x:10,y:0,z:0},2)]).at(-1).x,10);
 assert.throws(()=>joinRoutes([plotCourse(origin,{x:200,y:0,z:0},200),plotCourse({x:200,y:0,z:0},{x:202,y:0,z:0},2)]));
 let position=origin,movement=null,targets=[];const send=async c=>{if(c.operation==='GET /api/probe/{probeId}')return {probe:{id:1,status:'idle',sector:{relative:position},fuel:{deuterium:100},systems:{integrityPercent:100},movement}};if(c.operation.endsWith('/mannies'))return {mannies:[]};if(c.operation==='GET /api/sector')return {sector:{relativeCoordinates:{x:+c.params.x,y:+c.params.y,z:+c.params.z},scan:{requiredResidenceSeconds:0,currentSectorResidenceSeconds:1,scanQuality:1},objects:[]}};if(c.operation.endsWith('/move')){const target=c.body.target;const accepted={status:'preparing',origin:position,target};targets.push(target);position=target;movement={...accepted,status:'arrived'};return {movement:accepted}}throw Error(c.operation)};
 await runRoute({path,probeId:'1',maxWaitHours:1,maxHop:2,signal:new AbortController().signal,send,report:()=>{}});assert.deepEqual(targets,path.slice(1));
 targets=[];await assert.rejects(runRoute({path,probeId:'1',maxWaitHours:1,maxHop:1,signal:new AbortController().signal,send,report:()=>{}}));assert.equal(targets.length,0);
 console.log('PASS: counted/full cargo loops, printer, idle waits, interruption/no retry, persistence, capacity errors, >6,000 route cases, multi-sector launches and hop bounds');
})().catch(e=>{console.error(e);process.exitCode=1});
