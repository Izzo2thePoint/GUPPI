import {useEffect,useState} from 'react';
import type {Coord} from '@/lib/navigation';
import {coordKey} from '@/lib/navigation';
import type {Bookmark} from '@/lib/system-archive';
export function SystemBookmark({coord,bookmark,onSave}:{coord:Coord;bookmark?:Bookmark|null;onSave:(coord:Coord,bookmark:Bookmark|null)=>Promise<void>}){
 const [name,setName]=useState(bookmark?.name||''),[notes,setNotes]=useState(bookmark?.notes||''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setName(bookmark?.name||'');setNotes(bookmark?.notes||'');setMessage('');setError('')},[coordKey(coord),bookmark?.updatedAt]);
 const save=async(remove=false)=>{setBusy(true);setError('');setMessage('');try{await onSave(coord,remove?null:{name:name.trim(),notes:notes.trim(),updatedAt:Date.now()});setMessage(remove?'Bookmark removed. System observations are kept.':'Bookmark saved on this PC.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 return <section className="system-bookmark"><h3>{bookmark?'★ System bookmark':'☆ Bookmark this system'}</h3><p className="hint">Local to GUPPI. No game item or Manny is needed.</p><label>Bookmark name<input aria-label="Bookmark name" value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="e.g. Refueling stop" disabled={busy}/></label><label>System notes<textarea aria-label="System notes" value={notes} rows={4} maxLength={4000} onChange={e=>setNotes(e.target.value)} placeholder="Resources, hazards, or plans for your next visit…" disabled={busy}/></label><div className="row"><button disabled={busy} onClick={()=>save()}>Save bookmark</button>{bookmark&&<button disabled={busy} onClick={()=>save(true)}>Remove bookmark</button>}</div>{message&&<p role="status" className="hint">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}</section>;
}
