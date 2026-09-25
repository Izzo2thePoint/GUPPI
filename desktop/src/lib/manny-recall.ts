import type {ActiveTask} from './task-coordinator';
import type {CraftJob} from './construction-queue';
import type {Outpost} from './remote-mining';
export const recallManny='POST /api/probe/{probeId}/mannies/{mannyId}/recall';
export function recallPlan(probeId:string,mannyId:string,tasks:ActiveTask[],jobs:CraftJob[],sites:Outpost[],travelProbeId?:string){
 const affectedJobs=jobs.filter(j=>j.probeId===probeId&&j.status!=='done'&&(j.mannyId===mannyId||j.builder===mannyId||j.method==='atomic_3d_printer'&&!j.builder));
 const affectedSites=sites.filter(s=>s.probeId===probeId&&s.mannyIds.includes(mannyId)&&s.status!=='complete');
 const affectedTasks=tasks.filter(t=>t.probeId===probeId&&t.state==='running'&&(t.claims.some(c=>c.key==='manny:'+mannyId||c.key==='probe')||t.claims.some(c=>c.key==='printer')&&!t.claims.some(c=>c.key.startsWith('manny:'))||affectedJobs.some(j=>j.id===t.jobId)));
 return {jobs:affectedJobs,sites:affectedSites,tasks:affectedTasks,travel:travelProbeId===probeId};
}
