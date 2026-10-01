export type Coord={x:number;y:number;z:number};
export type Reading={coord:Coord;sector:any;observedAt:number};
export const coordKey=(p:Coord)=>`${p.x},${p.y},${p.z}`;
export function sectorHasResource(sector:any,resource:string):boolean{
 const pending=[sector];let count=0;
 while(pending.length&&count++<10000){const object=pending.pop();if(!object)continue;if(Array.isArray(object.resourceTypes)&&object.resourceTypes.includes(resource)||typeof object.resourceAmounts?.[resource]==='number'&&object.resourceAmounts[resource]>0)return true;for(const key of ['objects','minableTargets','bookmarkTargets'])if(Array.isArray(object[key]))pending.push(...object[key]);}
 return false;
}
export function isCoord(p:any):p is Coord{return !!p&&['x','y','z'].every(k=>Number.isSafeInteger(p[k])&&Math.abs(p[k])<=1000000)&&(p.x+p.y+p.z)%2===0;}
export function parseCoord(values:string[]):Coord{if(values.length!==3||values.some(v=>!v.trim()||! /^-?\d+$/.test(v.trim())))throw Error('Enter whole numbers for X, Y and Z.');const [x,y,z]=values.map(Number);const p={x,y,z};if(!isCoord(p))throw Error('Coordinates must be within ±1,000,000 and X + Y + Z must be even.');return p;}
export const offsets:Coord[]=[];for(let zero=0;zero<3;zero++)for(const a of [-1,1])for(const b of [-1,1]){const v=[0,0,0],axes=[0,1,2].filter(i=>i!==zero);v[axes[0]]=a;v[axes[1]]=b;offsets.push({x:v[0],y:v[1],z:v[2]});}
export function neighbors(p:Coord){if(!isCoord(p))throw Error('Current coordinates are unavailable or invalid.');return offsets.map(d=>({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z})).filter(isCoord);}
export function hops(a:Coord,b:Coord){const d=[Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.z-b.z)];return Math.max(...d,(d[0]+d[1]+d[2])/2);}
export function systemHopLimit(value:number){if(!Number.isInteger(value)||value<1||value>200)throw Error('System Hop must be a whole number from 1 to 200.');return value;}
export function routeDistance(path:Coord[]){return path.slice(1).reduce((sum,p,i)=>sum+hops(path[i],p),0);}
export function plotCourse(from:Coord,to:Coord,maxHop=1):Coord[]{systemHopLimit(maxHop);if(!isCoord(from)||!isCoord(to))throw Error('Invalid course coordinates.');const distance=hops(from,to);if(distance>200)throw Error(`Destination is ${distance} neighboring-sector hops away. Plot a closer leg (maximum 200 hops per plan).`);const path=[from];while(coordKey(path[path.length-1])!==coordKey(to)){const current=path[path.length-1];const next=neighbors(current).filter(p=>hops(p,to)===hops(current,to)-1).sort((a,b)=>{const error=(p:Coord)=>{const t=(path.length)/distance;return (p.x-from.x-(to.x-from.x)*t)**2+(p.y-from.y-(to.y-from.y)*t)**2+(p.z-from.z-(to.z-from.z)*t)**2};return error(a)-error(b)||coordKey(a).localeCompare(coordKey(b))})[0];if(!next)throw Error('No valid next sector within coordinate bounds.');path.push(next);}return path.filter((_,i)=>i%maxHop===0||i===path.length-1);}
export function danger(s:any){const objects=Array.isArray(s?.objects)?s.objects:[];return objects.some((o:any)=>o.type==='black_hole'||o.dangerLevel==='extreme')||/high|extreme|danger|black.?hole/i.test(s?.navigationalRisk||'')||/high|extreme/.test(s?.estimatedObjects?.dangerEstimate||'');}
export function readingLabel(s:any){if(!s)return 'Unscanned';const systems=s.objects?.filter((o:any)=>o.type==='solar_system');if(systems?.length)return systems.map((o:any)=>o.name||'Solar system').join(' · ');if(s.estimatedObjects?.star)return 'Stellar signature';if(s.objects?.length)return s.objects.slice(0,2).map((o:any)=>o.name||o.type?.replaceAll('_',' ')).join(' · ');return s.knowledgeLevel==='detailed'?'No objects reported':'Limited scan';}
export async function runSectorScans(points:Coord[],send:(p:Coord)=>Promise<unknown>,progress:(p:Coord,done:number,total:number,error?:string)=>void,signal:AbortSignal){
 if(!points.length||points.length>12||points.some(p=>!isCoord(p)))throw Error('Choose 1–12 valid sectors.');let succeeded=0;
 for(let i=0;i<points.length;i++){const p=points[i];if(signal.aborted)throw Error('Stopped');try{await send(p);if(signal.aborted)throw Error('Stopped');succeeded++;progress(p,i+1,points.length);}catch(e){if(signal.aborted)throw e;const message=e instanceof Error?e.message:String(e);progress(p,i+1,points.length,message);if(/HTTP (401|403)|Rate limit persisted|No confirmed response/.test(message))throw e;}}
 return succeeded;
}
