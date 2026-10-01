import {aboardReady} from './workshop';
import type {ActiveTask} from './task-coordinator';
export const travellingCrafter=(m:any)=>m?.location?.type==='probe'&&['crafting','assisting_atomic_printer'].includes(m.currentTask);
export const crewCanTravel=(m:any)=>aboardReady(m)||travellingCrafter(m);
export function taskCanTravel(t:ActiveTask,crew:any[]){
 return t.onboardCraft===true&&t.claims.every(c=>c.key==='printer'||c.key==='new-container'||c.key.startsWith('manny:')&&crew.some(m=>String(m.id)===c.key.slice(6)&&crewCanTravel(m)));
}
