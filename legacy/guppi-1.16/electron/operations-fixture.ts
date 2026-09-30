import assert from 'node:assert/strict';
export function operationsFixture(probe:any,sector:any){
 const ready=(id:string)=>({id,name:({repair:'Repair Manny',a:'Builder A',b:'Builder B',engine:'Engine Manny'} as any)[id],canReceiveOrders:true,currentTask:null,location:{type:'probe'},task:null});
 const crew:any[]=['repair','a','b','engine'].map(ready),events:string[]=[],pending=new Map<string,()=>void>();
 probe.systems.integrityPercent=70;
 probe.inventory.items.push(...['steel_bar','steel_bar','steel_bar','steel_bar','steel_plate','steel_plate'].map((type,i)=>({id:'move-part-'+i,type})));
 const rock:any={id:'operations-rock',type:'asteroid',name:'Workshop asteroid',mannyMineable:true,motorized:false,resourceTypes:['metals'],resourceAmounts:{metals:5}};
 sector.objects.push(rock);
 const recipe={id:'steel_bar',name:'Test steel bar',durationSeconds:60,craftableBy:['manny'],ingredients:[{type:'metals',quantity:.1,unit:'earth_container_equivalent'}],output:{type:'steel_bar',containerSpace:.01}};
 const accept=(id:string,task:string,done:()=>void)=>{const m=crew.find(m=>m.id===id);assert(m);assert.equal(m.currentTask,null,'No concurrent assignments to one worker');Object.assign(m,{currentTask:task,canReceiveOrders:false,task:{objectId:task.includes('asteroid')?rock.id:undefined},taskStartTime:new Date().toISOString()});pending.set(id,done);events.push(task+':'+id);return Response.json({manny:m},{status:202})};
 const upgrade={id:'deuterium_compression',name:'Deuterium compression',description:'Increase tank capacity.',available:true,done:false,installableOnProbe:true,durationSeconds:300,ingredients:[{type:'electric_motor',unit:'item',quantity:1},{type:'steel_bar',unit:'item',quantity:2}]};
 let trajectory:any=null;
 return {crew,events,rock,release(id:string){const m=crew.find(m=>m.id===id);pending.get(id)?.();pending.delete(id);Object.assign(m,ready(id));},
  async handle(u:URL,init:RequestInit):Promise<Response|null>{
   if(u.pathname==='/api/probe/1/mannies')return Response.json({mannies:crew});
   if(u.pathname==='/api/crafting-recipes')return Response.json({recipes:[recipe]});
   if(u.pathname.endsWith('/probe-improvements-available'))return Response.json({improvements:[upgrade,{...upgrade,id:'reinforced_container_couplings',name:'Reinforced couplings',available:false},{...upgrade,id:'relativistic_path_clearing',name:'Path clearing',done:true},{...upgrade,id:'distributed_thrust_anchoring',name:'Distributed Thrust Anchoring',installableOnProbe:false}]});
   const id=u.pathname.match(/\/mannies\/([^/]+)\//)?.[1],b=init.body?JSON.parse(String(init.body)):{};
   if(id&&init.method==='POST'){
    if(u.pathname.endsWith('/improve-probe')){assert.equal(b.improvement,upgrade.id);assert(!upgrade.done);return accept(id,'improving_probe',()=>{upgrade.done=true})}
    if(u.pathname.endsWith('/recall')){const m=crew.find(m=>m.id===id);assert(m);pending.delete(id);events.push('recall:'+id);if(m.location?.sector?.relative?.x===10){Object.assign(m,{currentTask:null,canReceiveOrders:true,task:null});return Response.json({manny:m},{status:202})}Object.assign(m,{currentTask:'returning',canReceiveOrders:false,location:{type:'sector',sector:{relative:{x:0,y:0,z:0}}},task:null});return Response.json({manny:m},{status:202})}
    if(u.pathname.endsWith('/repair')){assert.equal(b.integrityPercent,2);probe.inventory.resourceStocks[0].amount-=.02;return accept(id,'repair',()=>probe.systems.integrityPercent+=2)}
    if(u.pathname.endsWith('/craft')){assert.equal(b.recipe,'steel_bar');probe.inventory.resourceStocks[0].amount-=.1;return accept(id,'crafting',()=>probe.inventory.items.push({id:'bar-'+id,type:'steel_bar'}))}
    if(u.pathname.endsWith('/motorize-asteroid')){assert.equal(b.objectId,rock.id);return accept(id,'motorizing_asteroid',()=>{rock.id='motorized-operations-rock';rock.motorized=true;rock.motorFuelStatus='full'})}
    if(u.pathname.endsWith('/refuel-motorized-asteroid')){assert.equal(b.objectId,rock.id);assert.equal(rock.motorFuelStatus,'empty');return accept(id,'refueling_motorized_asteroid',()=>rock.motorFuelStatus='full')}
   }
   if(u.pathname.endsWith('/trajectories')&&init.method==='POST'){assert(u.pathname.includes('/'+rock.id+'/'));assert.equal(rock.motorFuelStatus,'full');assert.deepEqual(b,{mode:'sector_transfer',target:{x:1,y:1,z:0}});assert.equal(crew.find(m=>m.id==='engine').currentTask,null);trajectory={id:'trajectory-fixture',asteroidId:rock.id,mode:'sector_transfer',status:'in_transit',nextTransitionAt:new Date(Date.now()+86400000).toISOString(),direction:{x:1,y:1,z:0},sectorsCrossed:0,speed:{sectors:1,perSeconds:86400},result:null,failureReason:null};rock.trajectory=trajectory;rock.motorFuelStatus='empty';events.push('transfer');return Response.json({trajectory},{status:202})}
   if(u.pathname.endsWith('/asteroid-trajectories/trajectory-fixture'))return Response.json({trajectory});
   return null;
  }
 };
}
