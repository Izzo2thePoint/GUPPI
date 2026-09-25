import {coordKey,isCoord,type Reading} from './navigation';
export type Bookmark={name:string;notes:string;updatedAt:number};
export type ArchivedSystem=Reading&{bookmark?:Bookmark|null;scannedAt?:number;firstVisitedAt?:number;visitedAt?:number;detailedSector?:any;detailedAt?:number};
export type ArchiveProfile={id:string;name:string;systems:ArchivedSystem[]};
export type StoredSystem=ArchivedSystem&{id:string;probeId:string};
export function mergeSystem(previous:ArchivedSystem|undefined,incoming:ArchivedSystem):ArchivedSystem{
 const latest=!previous||incoming.observedAt>=previous.observedAt?incoming:previous;
 const result={...previous,...latest};
 const visits=[previous?.firstVisitedAt,previous?.visitedAt,incoming.firstVisitedAt,incoming.visitedAt].filter((n):n is number=>typeof n==='number');
 if(visits.length){result.firstVisitedAt=Math.min(...visits);result.visitedAt=Math.max(...visits)}
 result.scannedAt=Math.max(previous?.scannedAt||0,incoming.scannedAt||0)||undefined;
 // Position-only updates must not replace a real scan or its timestamp.
 if(previous?.scannedAt&&!incoming.scannedAt){result.sector=previous.sector;result.observedAt=previous.observedAt;}
 if(incoming.scannedAt&&!previous?.scannedAt){result.sector=incoming.sector;result.observedAt=incoming.observedAt;}
 const detailed=[previous?.detailedAt?{sector:previous.detailedSector,at:previous.detailedAt}:null,incoming.detailedAt?{sector:incoming.detailedSector,at:incoming.detailedAt}:null,
  previous?.sector?.knowledgeLevel==='detailed'?{sector:previous.sector,at:previous.observedAt}:null,
  incoming.scannedAt&&incoming.sector?.knowledgeLevel==='detailed'?{sector:incoming.sector,at:incoming.observedAt}:null].filter((v):v is {sector:any;at:number}=>!!v).sort((a,b)=>b.at-a.at)[0];
 if(detailed){result.detailedSector=detailed.sector;result.detailedAt=detailed.at}
 return result;
}
export function archiveObservation(operation:string,data:any,now=Date.now()):ArchivedSystem|null{
 if((operation==='GET /api/probe/{probeId}'||operation==='GET /api/probe')&&['idle','orbiting'].includes(data?.probe?.status)&&isCoord(data.probe.sector?.relative))
  return {coord:{...data.probe.sector.relative},sector:{knowledgeLevel:'unavailable',dataFreshness:'unavailable'},observedAt:now,firstVisitedAt:now,visitedAt:now};
 if((operation==='GET /api/probe/{probeId}/sector'||operation==='GET /api/sector')&&isCoord(data?.sector?.relativeCoordinates))
  return {coord:{...data.sector.relativeCoordinates},sector:structuredClone(data.sector),observedAt:now,scannedAt:now};
 return null;
}
export function archiveObservations(operation:string,data:any,now=Date.now()):ArchivedSystem[]{
 if(operation==='GET /api/probe/{probeId}/visited-sectors')return (Array.isArray(data?.visitedSectors)?data.visitedSectors:[]).flatMap((v:any)=>{
  const first=Date.parse(v.firstVisitedAt),last=Date.parse(v.lastVisitedAt);
  if(!isCoord(v.relativeCoordinates)||!Number.isFinite(first)||!Number.isFinite(last)||first>last)return [];
  return [{coord:{...v.relativeCoordinates},sector:{knowledgeLevel:'unavailable',dataFreshness:'unavailable'},observedAt:last,firstVisitedAt:first,visitedAt:last}];
 });
 const observation=archiveObservation(operation,data,now);return observation?[observation]:[];
}
const databaseName='neumann-system-archive-v1';
export function openArchive():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open(databaseName,1);
 request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('systems',{keyPath:'id'});db.createObjectStore('profiles',{keyPath:'id'})};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other cockpit windows and reopen the app to load the archive.'));
})}
export function loadArchive(db:IDBDatabase):Promise<Record<string,ArchiveProfile>>{return new Promise((resolve,reject)=>{
 const tx=db.transaction(['systems','profiles'],'readonly'),systems=tx.objectStore('systems').getAll(),profiles=tx.objectStore('profiles').getAll();
 tx.oncomplete=()=>{const result:Record<string,ArchiveProfile>={};for(const p of profiles.result)result[p.id]={...p,systems:[]};for(const s of systems.result as StoredSystem[]){if(!isCoord(s.coord))continue;const p=result[s.probeId]??={id:s.probeId,name:'Probe '+s.probeId,systems:[]};p.systems.push(s)}resolve(result)};
 tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
})}
export function saveArchiveBatch(db:IDBDatabase,entries:{probeId:string;name:string;system:ArchivedSystem}[]):Promise<void>{return new Promise((resolve,reject)=>{
 const tx=db.transaction(['systems','profiles'],'readwrite');for(const {probeId,name,system} of entries){tx.objectStore('systems').put({...system,id:probeId+':'+coordKey(system.coord),probeId});tx.objectStore('profiles').put({id:probeId,name});}
 tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
})}
