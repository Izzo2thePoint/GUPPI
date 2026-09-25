/** A capped or unverified load must not be counted as the planned amount. */
export function checkMiningBatchAccepted(body:any,response:any):void{
 const tasks=body?.tasks,results=response?.results;
 const uncertain=()=>{throw Error('Mining acceptance could not be verified. Future loads stopped. Check the accepted game tasks before rebuilding the remaining plan.');};
 if(!Array.isArray(tasks)||!tasks.length||!Array.isArray(results)||results.length!==tasks.length)uncertain();
 for(let i=0;i<tasks.length;i++){
  const requested=tasks[i],m=results[i]?.manny,t=m?.task,p=requested?.payload;
  if(requested?.task!=='mine'||!p||m?.id!==requested.mannyId||m.currentTask!=='mining'||t?.objectId!==p.objectId)uncertain();
  const resources=Array.isArray(t.resourceTypes)?t.resourceTypes:typeof t.resourceType==='string'?[t.resourceType]:[];
  if(!Array.isArray(p.resources)||resources.length!==p.resources.length||!p.resources.every((r:string)=>resources.includes(r))||(t.targetContainer?.id??null)!==(p.targetContainerId??null))uncertain();
  if(!Number.isFinite(t.targetAmount)||t.targetAmount<=0||!Number.isFinite(p.targetAmount)||p.targetAmount<=0)uncertain();
  if(Math.abs(t.targetAmount-p.targetAmount)>1e-10)throw Error('The game changed or capped a mining load. Future loads stopped so the plan cannot silently undercount. Accepted tasks continue; check their amounts before rebuilding the remaining plan.');
 }
}
