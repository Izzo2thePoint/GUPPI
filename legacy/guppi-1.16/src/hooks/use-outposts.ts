import {useEffect,useRef,useState} from 'react';
import {validateOutpost,type Outpost} from '@/lib/remote-mining';
const key='guppi-mining-outposts-v1';
export function useOutposts(){
 const [sites,setSites]=useState<Outpost[]>([]),[error,setError]=useState(''),ref=useRef<Outpost[]>([]),ready=useRef(false);
 useEffect(()=>{try{const parsed=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(parsed)||parsed.length>100)throw Error('Invalid outpost list');parsed.forEach(validateOutpost);ref.current=parsed.map(s=>s.status==='running'?{...s,status:'paused',message:'Paused after reopening. Accepted tasks may still be active.'}:s);setSites(ref.current);ready.current=true;}catch(e){setError('Saved outposts could not be read: '+(e as Error).message)}},[]);
 const commit=(next:Outpost[])=>{if(!ready.current)throw Error('Outpost storage is unavailable.');try{localStorage.setItem(key,JSON.stringify(next));}catch{setError('Outposts could not be saved. New orders are stopped.');throw Error('Outposts could not be saved.');}ref.current=next;setSites(next)};
 const save=(s:Outpost)=>{validateOutpost(s);const others=ref.current.filter(x=>x.id!==s.id);if(others.some(x=>x.probeId===s.probeId&&x.mannyIds.some(id=>s.mannyIds.includes(id))))throw Error('A Manny already belongs to another outpost. Remove that designation first.');if(others.length>=100)throw Error('Up to 100 outposts may be saved.');commit([...others,s])};
 return {sites,error,save,remove:(id:string)=>commit(ref.current.filter(s=>s.id!==id)),current:()=>ref.current};
}
