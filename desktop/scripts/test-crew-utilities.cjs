const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {crewCanTravel,taskCanTravel}=require('../src/lib/onboard-travel.ts');
const {renameCommand,checkUtility,jettisonCargo,inspectObject}=require('../src/lib/crew-utilities.ts');
const {commandClaims}=require('../src/lib/task-coordinator.ts');
const {runOutpost,remoteMine,outpostRemaining,departureCrew}=require('../src/lib/remote-mining.ts');
const {GameApiError}=require('../src/lib/probe-connection.ts');
const {api}=require('../src/lib/workshop.ts');
const worker={id:'m',location:{type:'probe'},currentTask:null,canReceiveOrders:true,cargo:{capacity:.1}},coord={x:0,y:0,z:0};
(async()=>{
 for(const task of ['crafting','assisting_atomic_printer']){assert(crewCanTravel({...worker,currentTask:task}));assert(!crewCanTravel({...worker,currentTask:task,location:{type:'sector'}}));assert.equal(departureCrew([{...worker,currentTask:task}]).length,0)}
 assert(!crewCanTravel({...worker,currentTask:'repair'}));assert(!crewCanTravel({...worker,currentTask:'unknown_too_far'}));
 assert(taskCanTravel({onboardCraft:true,claims:[{key:'manny:m'},{key:'printer'}]},[{...worker,currentTask:'crafting'}]));assert(!taskCanTravel({onboardCraft:true,claims:[{key:'asteroid:a'}]},[worker]));assert(!taskCanTravel({claims:[{key:'manny:m'}]},[worker]));
 assert.deepEqual(renameCommand('probe','1',' New name ').body,{name:'New name'});assert.deepEqual(renameCommand('container','box',' Cargo ').body,{label:'Cargo'});assert.throws(()=>renameCommand('manny','m','x'.repeat(41)));assert.throws(()=>renameCommand('probe','1',undefined));assert(commandClaims(renameCommand('manny','m','Busy builder')).every(c=>!c.key.startsWith('manny:')));
 const p={id:1,status:'idle',sector:{relative:coord},inventory:{items:[{id:'bar',type:'metal_bar',container:{id:'box'}}],resourceStocks:[{id:'metals',type:'metals',containers:[{container:{id:'box'},amount:.2}]}]}};
 const send=async c=>c.operation.endsWith('/mannies')?{mannies:[worker]}:c.operation.endsWith('/sector')?{sector:{relativeCoordinates:coord,objects:[{id:'relic',type:'dormant_structure',inspectable:true}]}}:{probe:p};
 await checkUtility(api(jettisonCargo,{amount:.1,containerId:'box'},{itemId:'metals'}),'1',send);
 await assert.rejects(checkUtility(api(jettisonCargo,{amount:.3,containerId:'box'},{itemId:'metals'}),'1',send),/valid resource amount/);
 await assert.rejects(checkUtility(api(jettisonCargo,{},{itemId:'missing'}),'1',send),/idle cargo/);
 await checkUtility(api(inspectObject,{objectId:'relic'},{mannyId:'m'}),'1',send);
 await assert.rejects(checkUtility(api(inspectObject,{objectId:'unknown'},{mannyId:'m'}),'1',send),/no longer/);
 async function mining(mode){let m=structuredClone(worker),saved,orders=[],polls=0;
 const site={id:'s',probeId:'1',name:'Two stores',coord,targetId:'rock',containerId:'a',containerIds:['a','b'],resource:'metals',mannyIds:['m'],total:.15,maxCargo:.1,remaining:outpostRemaining(.15,['m']),status:'paused',message:''};
 const run=()=>runOutpost(site,{signal:new AbortController().signal,save:s=>saved=structuredClone(s),report:()=>{},wait:async()=>{if(++polls>5)throw Error('Polling stuck');m.currentTask=null},send:async c=>{
 if(c.operation.endsWith('/mannies'))return {mannies:[structuredClone(m)]};
 if(c.operation==='GET /api/probe/{probeId}')return {probe:p};
 if(c.operation==='GET /api/sector')return {sector:{relativeCoordinates:coord,dataFreshness:'live',objects:[{id:'rock',type:'asteroid',resourceTypes:['metals'],resourceAmounts:{metals:2}},...['a','b'].map(id=>({id,type:'detached_container',mode:'hidden_on_asteroid',targetObjectId:'rock',freeCapacity:1}))]}};
 if(c.operation===remoteMine){orders.push(c.body.targetContainerId);assert.equal(saved.status,'review');if(mode==='uncertain')throw Error('Response lost');if(mode==='full'&&orders.length===1)throw new GameApiError(422,{error:{code:'container_full',message:'Container full'}});m={...m,currentTask:'mining',location:{type:'sector',sector:{relative:coord}},task:{objectId:'rock',resourceTypes:['metals'],targetContainer:{id:c.body.targetContainerId},targetAmount:mode==='capped'&&orders.length===1?.05:c.body.targetAmount}};return {manny:structuredClone(m)}}throw Error(c.operation)}});
 if(mode==='uncertain'){await assert.rejects(run(),/Response lost/);assert.deepEqual(orders,['a']);assert.equal(saved.status,'review')}else{await run();assert.equal(saved.status,'complete');assert.equal(saved.remaining.m,0);assert.deepEqual(orders,mode==='capped'?['a','b']:['a','b','b']);assert.equal(departureCrew([m],[site]).length,0)}
 }
 await mining('capped');await mining('full');await mining('uncertain');
 console.log('PASS: onboard crafting travel, conservative task claims, rename validation, cargo/inspection guards, multi-container capped loads/full rejection, exact totals and no uncertain retry.');
})().catch(e=>{console.error(e);process.exitCode=1});
