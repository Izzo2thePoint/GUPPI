const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {checkAssembly,assembleProbe,assemblyParts}=require('../src/lib/probe-construction.ts');
const {executeWorkshopAction}=require('../src/lib/workshop-actions.ts');
const {mergeSystem}=require('../src/lib/system-archive.ts');
const command={operation:assembleProbe,params:{mannyId:'m1'},body:{model:'generic',containerIds:['a','b']}};
const m={id:'m1',canReceiveOrders:true,currentTask:null,location:{type:'probe'}};
const p={id:1,status:'idle',inventory:{containers:[{id:'a',kind:'container',usedCapacity:0},{id:'b',kind:'container',usedCapacity:0},{id:'core',kind:'probe',usedCapacity:0}],items:Object.entries(assemblyParts('generic')).flatMap(([type,n])=>Array.from({length:n},()=>({type})))}};
(async()=>{
 checkAssembly(command,p,[m],'1');
 for(const change of [c=>c.body.containerIds=['a','a'],c=>c.body.containerIds=['a','core'],c=>c.body.model='bad']){const c=structuredClone(command);change(c);assert.throws(()=>checkAssembly(c,p,[m],'1'))}
 for(const change of [q=>q.status='moving',q=>q.id=2,q=>q.inventory.items.pop(),q=>q.inventory.containers[1].usedCapacity=0.1]){const q=structuredClone(p);change(q);assert.throws(()=>checkAssembly(command,q,[m],'1'))}
 assert.throws(()=>checkAssembly(command,p,[{...m,currentTask:'mining'}],'1'));
 const tanker=structuredClone(command);tanker.body.model='deuterium_tanker';assert.throws(()=>checkAssembly(tanker,p,[m],'1'));
 const tankerProbe=structuredClone(p);tankerProbe.inventory.items=Object.entries(assemblyParts('deuterium_tanker')).flatMap(([type,n])=>Array.from({length:n},()=>({type})));checkAssembly(tanker,tankerProbe,[m],'1');
 const calls=[];await executeWorkshopAction(command,'1',async c=>{calls.push(c.operation);return c.operation===assembleProbe?{manny:m}:c.operation.endsWith('/mannies')?{mannies:[m]}:{probe:p}});assert.deepEqual(calls,['GET /api/probe/{probeId}','GET /api/probe/{probeId}/mannies',assembleProbe]);
 let posts=0;await assert.rejects(executeWorkshopAction(command,'1',async c=>{if(c.operation===assembleProbe){posts++;throw Error('Uncertain response')}return c.operation.endsWith('/mannies')?{mannies:[m]}:{probe:p}}));assert.equal(posts,1);
 posts=0;await assert.rejects(executeWorkshopAction(command,'1',async c=>{if(c.operation===assembleProbe)posts++;return c.operation.endsWith('/mannies')?{mannies:[{...m,currentTask:'mining'}]}:{probe:p}}));assert.equal(posts,0);
 const bookmark={name:'Base',notes:'fuel',updatedAt:20};const old={coord:{x:1,y:2,z:3},sector:{knowledgeLevel:'detailed'},observedAt:10,scannedAt:10,bookmark};const scan={...old,observedAt:30,scannedAt:30};delete scan.bookmark;
 assert.deepEqual(mergeSystem(old,scan).bookmark,bookmark);assert.equal(mergeSystem({...old,bookmark:null},scan).bookmark,null);assert.equal(mergeSystem(old,{...scan,scannedAt:undefined,visitedAt:40}).bookmark.notes,'fuel');
 console.log('PASS: assembly eligibility, both models, fresh telemetry, single order/no retry, bookmark preservation and removal');
})().catch(e=>{console.error(e);process.exitCode=1});
