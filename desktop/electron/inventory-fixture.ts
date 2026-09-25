import assert from 'node:assert/strict';
export function inventoryFixture(probe:any){
 const crew:any[]=[['builder','Builder Manny'],['mover','Transfer Manny'],['stored','Stored Manny']].map(([id,name])=>({id,name,currentTask:null,canReceiveOrders:true,location:{type:'probe'},task:null}));
 const rules=():{priority:string[];exclusion:string[];strictExclusion:string[]}=>({priority:[],exclusion:[],strictExclusion:[]});
 const containers=[{id:'probe-core',kind:'probe',label:'Core storage',capacity:2,usedCapacity:0,freeCapacity:2,rules:{...rules(),priority:['future_item']}},{id:'cargo-b',kind:'container',label:'Cargo B',capacity:2,usedCapacity:0,freeCapacity:2,rules:rules()}];
 const items:any[]=[...crew.map(m=>({id:m.id,type:'manny',name:m.name,containerSpace:.05,currentTask:null,container:{id:'probe-core',label:'Core storage'}})),...['bar-one','bar-two'].map(id=>({id,type:'steel_bar',name:id==='bar-one'?'Steel bar one':'Steel bar two',containerSpace:.01,currentTask:null,container:{id:'probe-core',label:'Core storage'}})),{id:'extra-box',type:'additional_container',name:'Additional container',containerSpace:0,container:{id:'probe-core'}}];
 const stocks=[{id:'metals',type:'metals',name:'Metals',amount:1,containers:[{container:{id:'probe-core',label:'Core storage'},amount:1},{container:{id:'cargo-b',label:'Cargo B'},amount:0}]}];
 Object.assign(probe.inventory,{containers,items,resourceStocks:stocks});const events:string[]=[],pending=new Map<string,()=>void>();
 function update(){for(const c of containers){c.usedCapacity=items.filter(i=>i.container?.id===c.id).reduce((n,i)=>n+i.containerSpace,0)+stocks.reduce((n,s)=>n+s.containers.filter(p=>p.container.id===c.id).reduce((v,p)=>v+p.amount,0),0);c.freeCapacity=Math.round((c.capacity-c.usedCapacity)*1e9)/1e9;}probe.inventory.capacity=4;probe.inventory.usedCapacity=containers.reduce((n,c)=>n+c.usedCapacity,0);probe.inventory.freeCapacity=4-probe.inventory.usedCapacity;stocks[0].amount=stocks[0].containers.reduce((n,s)=>n+s.amount,0)}update();
 const recipe={id:'steel_bar',name:'Test steel bar',craftableBy:['manny'],ingredients:[{type:'metals',unit:'earth_container_equivalent',quantity:.1}],output:{type:'steel_bar',containerSpace:.01},durationSeconds:60};
 return {crew,events,containers,items,stocks,update,
  release(id:string){pending.get(id)?.();pending.delete(id);const m=crew.find(m=>m.id===id);Object.assign(m,{currentTask:null,canReceiveOrders:true,task:null});const item=items.find(i=>i.id===id);if(item)item.currentTask=null;update();},
  async handle(u:URL,init:RequestInit):Promise<Response|null>{
   const b=init.body?JSON.parse(String(init.body)):{};
   if(u.pathname.endsWith('/mannies'))return Response.json({mannies:crew});
   if(u.pathname==='/api/crafting-recipes')return Response.json({recipes:[recipe]});
   const containerId=u.pathname.match(/\/storage-containers\/([^/]+)/)?.[1];
   if(containerId){const c=containers.find(c=>c.id===containerId);assert(c);if(init.method==='PATCH'){assert(u.pathname.endsWith('/rules'));assert.deepEqual(Object.keys(b).sort(),['exclusion','priority','strictExclusion']);c.rules=structuredClone(b);events.push('rules:'+c.id);}return Response.json({container:c,inventory:probe.inventory});}
   if(u.pathname.endsWith('/craft')&&init.method==='POST'){
    const m=crew.find(m=>m.id==='builder');assert.equal(m.currentTask,null);stocks[0].containers[0].amount-=.1;Object.assign(m,{currentTask:'crafting',canReceiveOrders:false});events.push('craft:builder');pending.set('builder',()=>items.push({id:'crafted-bar',type:'steel_bar',name:'Crafted steel bar',containerSpace:.01,currentTask:null,container:{id:'probe-core'}}));update();return Response.json({manny:m},{status:202});
   }
   if(u.pathname.endsWith('/storage-moves')&&init.method==='POST'){
    assert.equal(init.headers&&new Headers(init.headers).get('Content-Type'),'application/json');const m=crew.find(m=>m.id===b.actorMannyId);assert(m);assert.equal(m.currentTask,null);assert.equal(b.fromContainerId,'probe-core');assert.equal(b.toContainerId,'cargo-b');const target=containers[1];
    const moving=b.kind==='item'?b.itemIds:b.kind==='manny'?b.targetMannyIds:[];assert(Array.isArray(moving));for(const id of moving)assert(items.some(i=>i.id===id&&i.container.id==='probe-core'));
    pending.set(m.id,()=>{if(b.kind==='resource'){assert.equal(b.resourceType,'metals');stocks[0].containers[0].amount-=b.amount;stocks[0].containers[1].amount+=b.amount;}else for(const id of moving)items.find(i=>i.id===id).container={id:target.id,label:target.label}});
    Object.assign(m,{currentTask:'moving_stockage',canReceiveOrders:false,taskStartTime:new Date().toISOString(),taskEstimatedEndTime:new Date(Date.now()+10000).toISOString()});events.push('move:'+b.kind);return Response.json({manny:m,inventory:probe.inventory},{status:202});
   }
   return null;
  }
 };
}

