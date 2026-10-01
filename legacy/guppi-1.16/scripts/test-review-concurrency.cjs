const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {retryAfterDelay,rateResetDelay}=require('../src/lib/rate-limit.ts');
const {checkMiningBatchAccepted}=require('../src/lib/mining-acceptance.ts');
const {waitForDeparture}=require('../src/lib/departure-queue.ts');
const {runRoutine}=require('../src/lib/engine.ts');
const {createMiningRoutine}=require('../src/lib/mining.ts');
const {createTaskCoordinator}=require('../src/lib/task-coordinator.ts');
const {crewCanTravel,taskCanTravel}=require('../src/lib/onboard-travel.ts');
const {mergeMannyResponse}=require('../src/lib/manny-telemetry.ts');
const crew=[{id:'a',currentTask:null,canReceiveOrders:true,location:{type:'probe'},cargo:{capacity:.1}}];
const batch={tasks:[{mannyId:'a',task:'mine',payload:{objectId:'rock',resources:['metals'],targetAmount:.1,targetContainerId:'box'}}]};
const accepted=()=>({results:[{manny:{id:'a',currentTask:'mining',task:{objectId:'rock',resourceTypes:['metals'],targetAmount:.1,targetContainer:{id:'box'}}}}]});
(async()=>{
 const previous=structuredClone(crew),saved=structuredClone(previous);
 for(const data of [{mannies:[null]},{mannies:[{}]},{mannies:[{id:1}]},{mannies:[{id:''}]},{mannies:[]},{mannies:null},{mannies:[crew[0],crew[0]]},{mannies:[{id:'a',name:{}}]},{mannies:[{id:'a',currentTask:42}]},{manny:null},{results:[{manny:null}]}]){
  if(Array.isArray(data.mannies)&&data.mannies.length===0){assert.deepEqual(mergeMannyResponse(previous,data),[]);continue;}
  assert.throws(()=>mergeMannyResponse(previous,data),/telemetry is invalid/);assert.deepEqual(previous,saved,'Rejected telemetry never changes the last good roster');
 }
 assert.throws(()=>mergeMannyResponse(previous,{},true),/telemetry is invalid/);
 const nonCrew={results:[{id:'x'}]};assert.strictEqual(mergeMannyResponse(previous,nonCrew),previous);assert.throws(()=>mergeMannyResponse(previous,nonCrew,false,true),/telemetry is invalid/);
 for(const data of [{},{results:[]},{results:[null]}])assert.throws(()=>mergeMannyResponse(previous,data,false,true),/telemetry is invalid/);
 assert.strictEqual(mergeMannyResponse(previous,{probe:{id:1}}),previous);
 const updated=mergeMannyResponse(previous,{manny:{id:'a',currentTask:'crafting',canReceiveOrders:false}});
 assert.equal(updated[0].currentTask,'crafting');assert.deepEqual(updated[0].location,previous[0].location);assert.deepEqual(updated[0].cargo,previous[0].cargo);assert.deepEqual(previous,saved);
 const batchUpdate=mergeMannyResponse(updated,{results:[{manny:{id:'a',name:'Builder'}}]});assert.equal(batchUpdate[0].name,'Builder');assert.equal(batchUpdate[0].currentTask,'crafting');
 const now=Date.UTC(2026,8,15);
 assert.equal(retryAfterDelay('60',now),60000);assert.equal(retryAfterDelay(new Date(now+120000).toUTCString(),now),120000);
 assert.equal(rateResetDelay(String((now+90000)/1000),now),90000);
 for(const invalid of [undefined,null,'','invalid']){assert.equal(retryAfterDelay(invalid,now),60000);assert.equal(rateResetDelay(invalid,now),60000)}
 for(const huge of [Infinity,'Infinity',1e309,'1e309',2147484,86401])assert.throws(()=>retryAfterDelay(huge,now),/This request was stopped/);
 for(const huge of [Infinity,'1e309',(now+86400001)/1000])assert.throws(()=>rateResetDelay(huge,now),/This request was stopped/);
 assert.equal(retryAfterDelay(86400,now),86400000);assert.equal(rateResetDelay(now/1000-1,now),1000);
 checkMiningBatchAccepted(batch,accepted());
 const probeBatch=structuredClone(batch);delete probeBatch.tasks[0].payload.targetContainerId;const probeResult=accepted();delete probeResult.results[0].manny.task.targetContainer;checkMiningBatchAccepted(probeBatch,probeResult);
 for(const change of [r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].manny.id='other',r=>r.results[0].manny.currentTask=null,r=>r.results[0].manny.task.objectId='other',r=>r.results[0].manny.task.targetAmount=.05,r=>r.results[0].manny.task.targetAmount=.2,r=>r.results[0].manny.task.targetAmount=NaN,r=>r.results[0].manny.task.targetContainer.id='other',r=>r.results[0].manny.task.resourceTypes=['ice']]){const response=accepted();change(response);assert.throws(()=>checkMiningBatchAccepted(batch,response));}
 // A capped acceptance stops the actual routine before any subsequent loads.
 const routine=createMiningRoutine({id:'rock',name:'Rock',resourceTypes:['metals']},'metals',.2,1,crew,'1',{id:'box'},.1);let writes=0;
 await assert.rejects(runRoutine(routine,'1',false,new AbortController().signal,async c=>{if(c.operation.startsWith('POST ')){writes++;const r=accepted();r.results[0].manny.task.targetAmount=.05;checkMiningBatchAccepted(c.body,r);return r}return {manny:{currentTask:null}}},()=>{},()=>{}),/capped/);assert.equal(writes,1);
 // Telemetry that resolves after the deadline or after cancellation cannot approve departure.
 async function departure(mode){let time=0,reads=0;const abort=new AbortController();return waitForDeparture({probeId:'1',origin:{x:0,y:0,z:0},hours:1,signal:abort.signal,jobs:()=>[],isBusy:()=>false,report:()=>{},now:()=>time,send:async c=>{reads++;if((mode==='late-probe'&&reads===1)||(mode==='late-crew'&&reads===2))time=3600001;if(mode==='cancel'&&reads===2)abort.abort();return c.operation.endsWith('/mannies')?{mannies:crew}:{probe:{id:1,status:'idle',sector:{relative:{x:0,y:0,z:0}}}}}})}
 await departure('ready');for(const mode of ['late-probe','late-crew'])await assert.rejects(departure(mode),/expired/);await assert.rejects(departure('cancel'),/cancelled/);
 // Recall installs the hold before owners are aborted and blocks new workers.
 const co=createTaskCoordinator(),task=co.begin('Craft','1',[{key:'manny:a'}]);task.onboardCraft=true;
 assert(taskCanTravel(task,crew));assert(crewCanTravel({...crew[0],currentTask:'crafting'}));assert(!crewCanTravel({...crew[0],currentTask:'repair'}));
 const {hold}=co.interruptManny('1','a',[task.id]);assert(task.controller.signal.aborted);co.finish(task,Error('Stopped'));assert.throws(()=>co.begin('New craft','1',[{key:'manny:a'}]));co.finish(hold);co.begin('New craft','1',[{key:'manny:a'}]);
 console.log('PASS: invalid roster rejection/partial Manny updates, bounded rate-limit waits, verified batch mining acceptance/no further capped loads, departure deadline/cancellation after reads, crafting travel and recall reservation');
})().catch(e=>{console.error(e);process.exitCode=1});
