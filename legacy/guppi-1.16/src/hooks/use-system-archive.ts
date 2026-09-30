import {useEffect,useRef,useState} from 'react';
import {archiveObservations,mergeSystem,openArchive,loadArchive,saveArchiveBatch,type ArchiveProfile,type ArchivedSystem,type Bookmark} from '@/lib/system-archive';
import {coordKey,isCoord,type Coord} from '@/lib/navigation';

export function useSystemArchive(){
 const [profiles,setProfiles]=useState<Record<string,ArchiveProfile>>({}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const state=useRef<Record<string,ArchiveProfile>>({}),ready=useRef<Promise<IDBDatabase>|null>(null),queue=useRef(Promise.resolve());
 const pending=useRef(new Map<string,{probeId:string;name:string;system:ArchivedSystem}>());
 function initialize(){if(!ready.current)ready.current=openArchive().then(async db=>{state.current=await loadArchive(db);setProfiles(state.current);setLoading(false);return db});return ready.current}
 useEffect(()=>{void initialize().catch(()=>{setLoading(false);setError('The system archive could not be opened. New observations cannot be saved. Restart the app to retry.');})},[]);
 function record(probeId:string,operation:string,data:any){
  if(!probeId)return;const observations=archiveObservations(operation,data);if(!observations.length)return;
  // Serialize storage independently of the API queue; game requests do not wait for disk writes.
  queue.current=queue.current.then(async()=>{
   const db=await initialize(),profile=state.current[probeId]||{id:probeId,name:'Probe '+probeId,systems:[]};
   const name=data?.probe?.name||profile.name,systems=new Map(profile.systems.map(r=>[coordKey(r.coord),r]));
   for(const observation of observations){const key=coordKey(observation.coord),system=mergeSystem(systems.get(key),observation);systems.set(key,system);pending.current.set(probeId+':'+key,{probeId,name,system});}
   const next={...profile,name,systems:[...systems.values()]};
   state.current={...state.current,[probeId]:next};setProfiles(state.current);
   try{await saveArchiveBatch(db,[...pending.current.values()]);pending.current.clear();setError('')}catch{setError('Some system observations could not be saved to disk. They are visible for this session only. Check available disk space; saving will retry after the next observation.');}
  }).catch(()=>{setLoading(false);setError('The system archive is unavailable. Restart the app to retry.');});
 }
 function setBookmark(probeId:string,coord:Coord,bookmark:Bookmark|null):Promise<void>{
  const operation=queue.current.then(async()=>{
   if(!probeId||!isCoord(coord))throw Error('Choose a probe archive and valid sector first.');
   if(bookmark&&(typeof bookmark.name!=='string'||typeof bookmark.notes!=='string'||bookmark.name.length>80||bookmark.notes.length>4000))throw Error('Use a name up to 80 characters and notes up to 4,000 characters.');
   const db=await initialize(),profile=state.current[probeId]||{id:probeId,name:'Probe '+probeId,systems:[]},key=coordKey(coord);
   const existing=profile.systems.find(r=>coordKey(r.coord)===key),system:ArchivedSystem={...(existing||{coord:{...coord},sector:{knowledgeLevel:'unavailable',dataFreshness:'unavailable'},observedAt:Date.now()}),bookmark:bookmark?{name:bookmark.name.trim(),notes:bookmark.notes.trim(),updatedAt:Date.now()}:null};
   const updates=new Map(pending.current);updates.set(probeId+':'+key,{probeId,name:profile.name,system});
   try{await saveArchiveBatch(db,[...updates.values()])}catch{throw Error('Bookmark could not be saved. Check available disk space and retry.');}
   pending.current.clear();setError('');state.current={...state.current,[probeId]:{...profile,systems:[...profile.systems.filter(r=>coordKey(r.coord)!==key),system]}};setProfiles(state.current);
  });queue.current=operation.catch(()=>{});return operation;
 }
 return {profiles,loading,error,record,setBookmark};
}
