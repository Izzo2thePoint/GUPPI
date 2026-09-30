import {useEffect,useRef,useState} from 'react';
import {restoreCraftQueue,validateCraftDraft,type CraftDraft,type CraftJob} from '@/lib/construction-queue';
const storageKey='guppi-construction-queue-v1';
export function useConstructionQueue(){
 const [jobs,setJobs]=useState<CraftJob[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),ref=useRef<CraftJob[]>([]),ready=useRef(false);
 useEffect(()=>{try{ref.current=restoreCraftQueue(localStorage.getItem(storageKey)||'[]');setJobs(ref.current);ready.current=true;}catch(e){setError('The saved queue could not be loaded. '+(e as Error).message)}setLoaded(true)},[]);
 const commit=(next:CraftJob[])=>{if(!ready.current)throw Error('The construction queue is unavailable.');try{localStorage.setItem(storageKey,JSON.stringify(next))}catch{setError('The queue could not be saved. New orders are stopped. Check disk space.');throw Error('The queue could not be saved.')}ref.current=next;setJobs(next);setError('')};
 const addMany=(drafts:CraftDraft[])=>{drafts.forEach(validateCraftDraft);if(ref.current.length+drafts.length>100)throw Error('The queue holds up to 100 jobs.');commit([...ref.current,...drafts.map(d=>({...d,id:crypto.randomUUID(),completed:0,status:'queued' as const,message:'Waiting in queue.'}))])};
 const add=(draft:CraftDraft)=>{validateCraftDraft(draft);if(ref.current.length>=100)throw Error('The queue holds up to 100 jobs. Remove finished jobs to add more.');commit([...ref.current,{...draft,id:crypto.randomUUID(),completed:0,status:'queued',message:'Waiting in queue.'}])};
 const update=(id:string,patch:Partial<CraftJob>)=>commit(ref.current.map(j=>j.id===id?{...j,...patch}:j));
 const remove=(id:string)=>{try{commit(ref.current.filter(j=>j.id!==id))}catch(e){setError((e as Error).message)}};
 const retry=(id:string)=>{try{const j=ref.current.find(j=>j.id===id);if(j?.status==='blocked')update(id,{status:'queued',message:'Waiting to retry after checks.'})}catch(e){setError((e as Error).message)}};
 return {jobs,error,loaded,add,addMany,update,remove,retry,current:()=>ref.current};
}
