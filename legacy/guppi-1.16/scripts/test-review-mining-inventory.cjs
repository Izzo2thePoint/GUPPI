const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
function componentHarness(relative,name){
 const filename=path.resolve(__dirname,'../src/components',relative),slots=[];let cursor=0;let pending=[];const original=Module._load;
 const hooks={useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial})},useEffect(fn,deps){const index=cursor++;if(!slots[index]||deps.some((d,i)=>d!==slots[index][i])){slots[index]=deps;pending.push(fn)}},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value}];}};
 const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 Module._load=function(id,parent,...args){if(parent===m){if(id==='react')return hooks;if(id==='./live-data')return {GameSelect:()=>null};if(id.startsWith('@/'))return original.call(this,path.resolve(__dirname,'../src',id.slice(2)),parent,...args);}return original.call(this,id,parent,...args)};
 try{m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename)}finally{Module._load=original}
 return props=>{cursor=0;pending=[];let tree=m.exports[name](props);for(const fn of pending)fn();if(pending.length){cursor=0;pending=[];tree=m.exports[name](props)}return tree};
}
function elements(node){if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object')return [];return [node,...elements(node.props?.children)]}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(node==null||typeof node==='boolean')return '';if(typeof node==='object')return text(node.props?.children);return String(node)}
const button=(tree,label)=>elements(tree).find(n=>n.type==='button'&&text(n)===label);
(async()=>{
 const render=componentHarness('jettison-cargo.tsx','JettisonCargo');let sent=[];
 const props={probe:{inventory:{resourceStocks:[{id:'metals-stock',name:'Metals',type:'metals',containers:[{container:{id:'box'},amount:1}]}],items:[]}},disabled:false,act:async c=>{sent.push(c)},refresh:()=>{}};
 let tree=render(props);elements(tree).find(n=>n.props?.label==='Cargo to jettison').props.onChange('metals-stock');
 tree=render(props);elements(tree).find(n=>n.props?.label==='Jettison source').props.onChange('box');
 tree=render(props);button(tree,'Review jettison').props.onClick();
 const refresh={...props,probe:{inventory:{resourceStocks:[],items:[]}}};tree=render(refresh);
 assert(text(tree).includes('Jettison 0.05 ECE of Metals?'),'Review must retain the reviewed amount and description after telemetry changes');
 await button(tree,'Jettison cargo live').props.onClick();
 assert.deepEqual(sent.map(c=>c.body),[{amount:.05,containerId:'box'}],'A partial jettison must never become an empty-body full-stock jettison');
 assert.equal(sent[0].params.itemId,'metals-stock');assert.equal(sent.length,1);
 const rename=componentHarness('rename-control.tsx','RenameControl');let rp={kind:'probe',id:'',name:'',disabled:false,act:async()=>({})};rename(rp);rp={...rp,id:'1',name:'First probe'};let rt=rename(rp);const input=t=>elements(t).find(n=>n.type==='input');assert.equal(input(rt).props.value,'First probe','Connecting fills a pristine rename draft');rp={...rp,name:'External rename'};rt=rename(rp);assert.equal(input(rt).props.value,'External rename','Pristine inputs follow telemetry names');input(rt).props.onChange({target:{value:'My draft'}});rp={...rp,name:'Another external rename'};rt=rename(rp);assert.equal(input(rt).props.value,'My draft','Polling preserves an edited draft');rp={...rp,id:'2',name:'Second probe'};rt=rename(rp);assert.equal(input(rt).props.value,'Second probe','Switching targets resets the old entity draft');
 const {executeWorkshopAction}=require('../src/lib/workshop-actions.ts'),{renameCommand,jettisonCargo}=require('../src/lib/crew-utilities.ts'),{api,probeGet,manniesGet}=require('../src/lib/workshop.ts');
 for(const [kind,id,result] of [['probe','1',{defaultProbeId:1,probes:[{id:1,name:'New'}]}],['manny','m',{manny:{id:'m',name:'New'}}],['container','box',{container:{id:'box',label:'New'}}]]){
  let writes=0;const command=renameCommand(kind,id,'New');await executeWorkshopAction(command,'1',async()=>{writes++;return result});assert.equal(writes,1);
  for(const invalid of [{},{...result,...(kind==='probe'?{probes:[{id:2,name:'New'}]}:kind==='manny'?{manny:{id,name:'Old'}}:{container:{id,label:'Old'}})}]){writes=0;await assert.rejects(executeWorkshopAction(command,'1',async()=>{writes++;return invalid}),/Rename was not confirmed/);assert.equal(writes,1,'Unconfirmed rename is never retried');}
 }
 const jet=api(jettisonCargo,{containerId:'box',amount:.05},{itemId:'metals-stock'});let writes=0;const send=async c=>{if(c.operation===probeGet)return {probe:{id:1,status:'idle',inventory:props.probe.inventory}};if(c.operation===manniesGet)return {mannies:[]};writes++;return {}};await assert.rejects(executeWorkshopAction(jet,'1',send),/Jettison was not confirmed/);assert.equal(writes,1,'Unconfirmed jettison is never retried');
 writes=0;await executeWorkshopAction(jet,'1',async c=>c.operation===jettisonCargo?(writes++,{inventory:props.probe.inventory,jettisoned:{type:'metals',amount:.05}}):send(c));assert.equal(writes,1,'Documented jettison response is accepted');
 await executeWorkshopAction(renameCommand('probe','1','New'),'1',async()=>({probe:{id:1,name:'New'}}));
 const {runOutpost,remoteMine}=require('../src/lib/remote-mining.ts');const coord={x:0,y:0,z:0};
 const site={id:'site',probeId:'1',name:'Outpost',coord,targetId:'rock',containerId:'box',resource:'metals',mannyIds:['miner'],total:.05,maxCargo:.05,remaining:{miner:.05},status:'paused',message:''};
 for(const resourceData of [{resourceTypes:['ice']},{}]){let saved,orders=0;await assert.rejects(runOutpost(site,{signal:new AbortController().signal,save:s=>saved=structuredClone(s),report:()=>{},wait:async()=>{throw Error('Unexpected wait')},send:async c=>{
  if(c.operation===probeGet)return {probe:{id:1,status:'idle',sector:{relative:coord}}};if(c.operation===manniesGet)return {mannies:[{id:'miner',currentTask:null,location:{type:'probe'},canReceiveOrders:true,cargo:{capacity:.05}}]};
  if(c.operation==='GET /api/sector')return {sector:{relativeCoordinates:coord,dataFreshness:'live',objects:[{id:'rock',type:'asteroid',resourceTypes:['metals'],resourceAmounts:{metals:1}},{id:'box',type:'detached_container',mode:'hidden_on_asteroid',targetObjectId:'rock',freeCapacity:1}]}};
  if(c.operation===remoteMine){orders++;return {manny:{id:'miner',currentTask:'mining',task:{objectId:'rock',targetContainer:{id:'box'},targetAmount:.05,...resourceData}}}}throw Error(c.operation);
 }}),/resource could not be verified/);assert.equal(saved.status,'review');assert.equal(saved.remaining.miner,.05);assert.equal(orders,1);}
 console.log('PASS: jettison review survives inventory refresh; rename drafts follow identity without losing edits; documented rename responses and uncertain jettison checks dispatch once; unknown/wrong outpost resources preserve review state and totals.');
})().catch(e=>{console.error(e);process.exitCode=1});
