import {pause,type Command} from './engine';
export type Claim={key:string;shared?:boolean};
export type ActiveTask={id:string;name:string;probeId:string;controller:AbortController;claims:Claim[];jobId?:string;onboardCraft?:boolean;state:'running'|'complete'|'stopped'|'error';message:string};
export class TaskConflictError extends Error{}
const overlap=(a:Claim,b:Claim)=>a.key==='probe'||b.key==='probe'||a.key===b.key&&(!a.shared||!b.shared);
export function commandClaims(c:Command):Claim[]{
 if(c.operation.startsWith('GET ')||/\/messages(?:\/|$)|\/alerts(?:\/|$)|\/logbook(?:\/|$)/.test(c.operation))return [];
 const b=c.body as any,claims:Claim[]=[];
 if(c.operation.startsWith('PATCH ')&&b&&(typeof b.name==='string'||typeof b.label==='string')&&!('isDefault' in b))return [{key:'name:'+c.operation+':'+(c.params.mannyId||c.params.containerId||'probe')}];
 if(c.operation.endsWith('/jettison'))claims.push({key:'item:'+c.params.itemId});
 if(/\/(salvage|inspect-sector-object)$/.test(c.operation)&&b?.objectId)claims.push({key:'object:'+b.objectId});
 if(/\/move$/.test(c.operation))return [{key:'probe'}];
 for(const id of [c.params.mannyId,b?.mannyId,b?.actorMannyId,b?.targetMannyId,...(Array.isArray(b?.targetMannyIds)?b.targetMannyIds:[]),...(Array.isArray(b?.tasks)?b.tasks.map((t:any)=>t.mannyId):[])])if(id)claims.push({key:'manny:'+id});
 if(c.operation.includes('/atomic-printer/'))claims.push({key:'printer'});
 if(c.operation.endsWith('/repair')||b?.tasks?.some((t:any)=>t.task==='repair'))claims.push({key:'integrity'});
 if(c.operation.endsWith('/improve-probe')&&b?.improvement)claims.push({key:'upgrade:'+b.improvement});
 const asteroid=c.params.asteroidId||(/\/mine$|\/motorize-asteroid$|\/refuel-motorized-asteroid$|\/sculpt-duck-asteroid$/.test(c.operation)?b?.objectId:b?.mode==='hidden_on_asteroid'?b?.objectId:null);
 if(asteroid)claims.push({key:'asteroid:'+asteroid,shared:c.operation.endsWith('/mine')||b?.mode==='hidden_on_asteroid'});
 for(const t of Array.isArray(b?.tasks)?b.tasks:[])if(t.task==='mine'){if(t.payload?.objectId)claims.push({key:'asteroid:'+t.payload.objectId,shared:true});if(t.payload?.targetContainerId)claims.push({key:'container:'+t.payload.targetContainerId,shared:true});}
 for(const id of [b?.containerId,b?.targetContainerId])if(id)claims.push({key:'container:'+id,shared:c.operation.endsWith('/mine')});
 if(c.operation.endsWith('/recover-storage-container')&&b?.objectId)claims.push({key:'container:'+b.objectId});
 if(c.operation.endsWith('/storage-moves')){for(const id of [b?.fromContainerId,b?.toContainerId])if(id)claims.push({key:'container:'+id,shared:true});for(const id of [b?.itemId,...(Array.isArray(b?.itemIds)?b.itemIds:[])])if(id)claims.push({key:'item:'+id});}
 if(c.params.containerId&&!c.operation.startsWith('GET '))claims.push({key:'container:'+c.params.containerId});
 if(c.operation.includes('/storage')&&!claims.length)claims.push({key:'storage'});
 return claims;
}
export function createTaskCoordinator(changed:(tasks:ActiveTask[])=>void=()=>{}){
 const tasks=new Map<string,ActiveTask>();
 const publish=()=>changed([...tasks.values()]);
 const conflict=(probeId:string,claims:Claim[],owner?:AbortSignal)=>[...tasks.values()].find(t=>t.state==='running'&&t.probeId===probeId&&t.controller.signal!==owner&&t.claims.some(a=>claims.some(b=>overlap(a,b))));
 const assert=(probeId:string,claims:Claim[],owner?:AbortSignal)=>{const t=conflict(probeId,claims,owner);if(t)throw new TaskConflictError('Waiting for '+t.name+': it uses the same Manny, equipment, or target.');};
 const begin=(name:string,probeId:string,claims:Claim[]=[],controller=new AbortController())=>{assert(probeId,claims,controller.signal);const t:ActiveTask={id:crypto.randomUUID(),name,probeId,claims,controller,state:'running',message:'Starting…'};tasks.set(t.id,t);publish();return t;};
 // Install a reservation synchronously, before cancelling old owners. New jobs
 // cannot take the Manny while the previous controllers finish unwinding.
 const interruptManny=(probeId:string,mannyId:string,ids:string[])=>{const stopped=[...tasks.values()].filter(t=>t.probeId===probeId&&t.state==='running'&&(ids.includes(t.id)||t.claims.some(c=>c.key==='manny:'+mannyId||c.key==='probe')));const hold:ActiveTask={id:crypto.randomUUID(),name:'Recall Manny '+mannyId,probeId,controller:new AbortController(),claims:[{key:'manny:'+mannyId}],state:'running',message:'Stopping affected automation…'};tasks.set(hold.id,hold);for(const t of stopped)t.controller.abort();publish();return {hold,stopped};};
 const report=(t:ActiveTask,message:string)=>{if(t.state==='running'){t.message=message;publish();}};
 const setClaims=(t:ActiveTask,claims:Claim[])=>{assert(t.probeId,claims,t.controller.signal);t.claims=claims;publish();};
 const finish=(t:ActiveTask,error?:unknown)=>{t.state=error?t.controller.signal.aborted?'stopped':'error':'complete';t.message=error?String((error as Error)?.message||error):'Complete';t.claims=[];const finished=[...tasks.values()].filter(x=>x.state!=='running');for(const old of finished.slice(0,-20))tasks.delete(old.id);publish();};
 const guardAutoBuilder=(probeId:string,crew:any[],owner?:AbortSignal)=>{for(const m of crew)if(m.location?.type==='probe'&&m.currentTask===null&&m.canReceiveOrders===true)assert(probeId,[{key:'manny:'+m.id}],owner);};
 const acquire=async(t:ActiveTask,claims:Claim[],signal:AbortSignal=t.controller.signal)=>{const deadline=Date.now()+168*3600000;while(true){if(signal.aborted)throw Error('Stopped');const other=conflict(t.probeId,claims,t.controller.signal);if(!other){setClaims(t,claims);return;}if(Date.now()>=deadline)throw Error('Timed out waiting for a task resource.');report(t,'Waiting for '+other.name);await pause(1000,signal);}};
 return {begin,interruptManny,report,setClaims,finish,assert,conflict,guardAutoBuilder,acquire,current:()=>[...tasks.values()],stopAll:()=>{for(const t of tasks.values())if(t.state==='running')t.controller.abort();},reservedMannies:(probeId:string)=>[...new Set([...tasks.values()].filter(t=>t.state==='running'&&t.probeId===probeId).flatMap(t=>t.claims.filter(c=>c.key.startsWith('manny:')).map(c=>c.key.slice(6))))]};
}

