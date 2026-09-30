import type {Command} from './engine';
import type {CraftJob} from './construction-queue';
export type ConstructionSession={controller:AbortController;probeId:string;jobIds:string[]};
/** Background crafting reserves its builders, not the entire interface. */
export function checkConstructionAccess(command:Command,probeId:string,session:ConstructionSession|null,jobs:CraftJob[],signal?:AbortSignal){
 if(!session||session.controller.signal.aborted||signal===session.controller.signal||command.operation.startsWith('GET '))return;
 if(probeId!==session.probeId&&command.operation.includes('{probeId}'))return;
 const reserved=jobs.filter(j=>session.jobIds.includes(j.id)&&['queued','checking','crafting'].includes(j.status));
 if(!reserved.length)return;
 const stop='Stop the crafting queue for probe '+session.probeId+' before sending this conflicting order.';
 if(/^(POST|DELETE) \/api\/probe(?:\/\{probeId\})?\/move$/.test(command.operation))throw Error(stop+' Course plotting and scans are still available.');
 if(command.operation.includes('/atomic-printer/')&&!command.operation.startsWith('GET '))throw Error(stop+' The printer may need a reserved builder.');
 const ids=new Set(reserved.flatMap(j=>[j.mannyId,j.builder].filter(Boolean)));
 const requested=[command.params.mannyId,...(Array.isArray((command.body as any)?.tasks)?(command.body as any).tasks.map((t:any)=>t.mannyId):[])];
 if(requested.some(id=>ids.has(String(id))))throw Error(stop+' That Manny is reserved for queued work.');
}
