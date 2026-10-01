export type MannyRecord={id:string;[key:string]:any};
const invalid=()=>{throw Error('Manny telemetry is invalid. Showing the last valid crew status; refresh before assigning new work.');};
function validateManny(m:any){
 if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.id!=='string'||!m.id.trim())invalid();
 for(const key of ['name','currentTask','taskVisibility','taskStartTime','taskEstimatedEndTime'])if(m[key]!=null&&typeof m[key]!=='string')invalid();
 if(m.canReceiveOrders!=null&&typeof m.canReceiveOrders!=='boolean')invalid();
 for(const key of ['location','task','cargo'])if(m[key]!=null&&(typeof m[key]!=='object'||Array.isArray(m[key])))invalid();
 if(m.location?.type!=null&&typeof m.location.type!=='string'||m.task?.target?.name!=null&&typeof m.task.target.name!=='string')invalid();
 if(m.task?.resourceTypes!=null&&(!Array.isArray(m.task.resourceTypes)||m.task.resourceTypes.some((r:any)=>typeof r!=='string')))invalid();
}
export function mergeMannyResponse(previous:MannyRecord[],data:any,requireRoster=false,requireBatch=false):MannyRecord[]{
 if(requireRoster||data&&typeof data==='object'&&'mannies' in data){
  if(!Array.isArray(data?.mannies))invalid();
  const ids=new Set();for(const m of data.mannies){validateManny(m);if(ids.has(m.id))invalid();ids.add(m.id);}
  return data.mannies;
 }
 const changes:any[]=[];
 if(data&&typeof data==='object'&&'manny' in data)changes.push(data.manny);
 if(requireBatch&&(!Array.isArray(data?.results)||!data.results.length))invalid();
 if(Array.isArray(data?.results))changes.push(...data.results.filter((r:any)=>requireBatch||r&&typeof r==='object'&&'manny' in r).map((r:any)=>r?.manny));
 changes.forEach(validateManny);
 if(!changes.length)return previous;
 const result=new Map(previous.map(m=>[m.id,m]));for(const m of changes)result.set(m.id,{...result.get(m.id),...m});return [...result.values()];
}
// All routine and monitoring requests share one queue and the same rate-limit clock.
export function createRequestQueue(){
 let tail:Promise<unknown>=Promise.resolve();
 return function enqueue<T>(job:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  if(signal?.aborted)return Promise.reject(Error('Stopped'));
  // Keep the serialization chain intact even when a waiting caller cancels.
  // Its caller can return immediately; the cancelled slot is skipped when reached.
  const task=tail.then(()=>{if(signal?.aborted)throw Error('Stopped');return job();});
  tail=task.then(()=>undefined,()=>undefined);
  if(!signal)return task;
  return new Promise<T>((resolve,reject)=>{
   const abort=()=>reject(Error('Stopped'));
   signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)abort();
   task.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
 };
}
