'use client';
import {useEffect,useState} from 'react';
import {useLiveData,LiveStatus,type ReadGame,type ActGame} from './live-data';
import {api} from '@/lib/workshop';
import {logbookList,logbookRead,logbookCreate,logbookUpdate,logbookDelete,logbookBody,sameLogbookPage,type LogbookPage} from '@/lib/logbook';
type Draft={id:string;title:string;content:string;base:LogbookPage|null};
const empty=():Draft=>({id:'',title:'',content:'',base:null});
const validPage=(p:any,probeId:string,id?:string)=>!!p&&typeof p==='object'&&/^\d+$/.test(String(p.id))&&String(p.probeId)===probeId&&(!id||String(p.id)===id)&&typeof p.title==='string'&&typeof p.content==='string'&&typeof p.updatedAt==='string';
export function Logbook({connected,active,busy,probeId,read,act}:{connected:boolean;active:boolean;busy:boolean;probeId:string;read:ReadGame;act:ActGame}){
 const draftKey=`guppi-logbook-draft-${probeId}`;
 const [draft,setDraft]=useState<Draft>(()=>{try{const d=JSON.parse(localStorage.getItem(draftKey)||'null');if(d&&typeof d.id==='string'&&typeof d.title==='string'&&typeof d.content==='string')return d.id&&validPage(d.base,probeId,d.id)?d:{...empty(),title:d.title,content:d.content};}catch{}return empty()});
 const [offset,setOffset]=useState(0),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const dirty=draft.base?draft.title!==draft.base.title||draft.content!==draft.base.content:!!(draft.title||draft.content);
 useEffect(()=>{try{if(dirty)localStorage.setItem(draftKey,JSON.stringify(draft));else localStorage.removeItem(draftKey);}catch{setError('This draft cannot be stored locally. Keep this tab open until saved.');}},[draft,dirty,draftKey]);
 const list=useLiveData(connected&&active,async signal=>{const r=await read(api(logbookList,null,{limit:'20',offset:String(offset)}),signal);if(!Array.isArray(r?.pages)||r.pages.some((p:any)=>!p||!/^\d+$/.test(String(p.id))||typeof p.title!=='string'||typeof p.updatedAt!=='string'))throw Error('The game did not return a valid logbook list.');return r;},`${probeId}:${offset}`);
 const detail=useLiveData(connected&&active&&!!draft.id&&!saving,async signal=>{const r=await read(api(logbookRead,null,{logbookPageId:draft.id}),signal);if(!validPage(r?.page,probeId,draft.id))throw Error('The game did not return the complete selected logbook page.');return r;},`${probeId}:${draft.id}`);
 useEffect(()=>{const p=detail.data?.page as LogbookPage|undefined;if(!p)return;setDraft(d=>{if(String(p.id)!==d.id||(d.base?(d.title!==d.base.title||d.content!==d.base.content):!!(d.title||d.content)))return d;return {id:String(p.id),title:p.title,content:p.content,base:p};});},[detail.data]);
 const changed=!!(draft.base&&detail.data?.page&&!sameLogbookPage(draft.base,detail.data.page));
 function select(id:string){if(saving||id===draft.id)return;if(dirty&&!window.confirm('Discard this unsaved logbook draft?'))return;setDraft({...empty(),id});setError('');setMessage('');}
 async function save(remove=false){
  if(remove&&!window.confirm('Delete this page from the game logbook?'))return;
  setError('');setMessage('');setSaving(true);
  try{
   const body=remove?null:logbookBody(draft.title,draft.content);
   const result=await act({...api(remove?logbookDelete:draft.id?logbookUpdate:logbookCreate,body,draft.id?{logbookPageId:draft.id}:{}),...(draft.base?{expectedLogbookPage:draft.base}:{})});
   if(remove){setDraft(empty());setMessage('Page deleted from the game logbook.');}
   else{const p=result?.page as LogbookPage;if(!validPage(p,probeId,draft.id))throw Error('Save was not confirmed. Your draft is kept. Check the game logbook before saving again.');setDraft({id:String(p.id),title:p.title,content:p.content,base:p});setMessage('Saved to the game logbook.');}
   list.refresh();detail.refresh();
  }catch(e){setError((e as Error).message);}finally{setSaving(false);}
 }
 const locked=saving||busy||!connected,loaded=!draft.id||!!draft.base;
 return <section className="panel logbook-panel"><div className="sectionhead"><div><h2>Probe logbook</h2><p className="hint">Synced with the selected probe’s game logbook. Changes appear here while this tab is open. Unsaved drafts stay on this PC.</p></div><button disabled={saving} onClick={()=>{if(draft.id)select('');else if(!dirty||window.confirm('Discard this unsaved logbook draft?'))setDraft(empty())}}>New page</button></div>
 <LiveStatus state={list} connected={connected}/><div className="logbook-layout"><aside aria-label="Logbook pages"><div className="logbook-pages">{(list.data?.pages||[]).map((p:LogbookPage)=><button key={p.id} aria-pressed={draft.id===String(p.id)} disabled={saving} onClick={()=>select(String(p.id))}><strong>{p.title}</strong><small>{new Date(p.updatedAt).toLocaleString()}</small></button>)}{list.data&&!list.data.pages.length&&<p className="hint">No pages here yet.</p>}</div><div className="row"><button disabled={!offset||list.loading} onClick={()=>setOffset(n=>Math.max(0,n-20))}>Previous</button><span>{offset+1}–{offset+(list.data?.pages?.length||0)}</span><button disabled={list.loading||!list.data||(list.data.pagination?.hasMore===false)||list.data.pages.length<20} onClick={()=>setOffset(n=>n+20)}>Next</button></div></aside>
 <div className="logbook-editor">{draft.id&&<LiveStatus state={detail} connected={connected}/>}<label>Title<input aria-label="Logbook title" maxLength={120} value={draft.title} disabled={saving||!loaded} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>Entry<textarea aria-label="Logbook entry" maxLength={20000} rows={16} value={draft.content} disabled={saving||!loaded} onChange={e=>setDraft(d=>({...d,content:e.target.value}))}/></label><p className="hint">{draft.content.length.toLocaleString()} / 20,000 characters · {dirty?'Unsaved draft':draft.id?'Saved game page':'New page'}</p>
 {changed&&dirty&&<p className="error" role="alert">This page changed in the game. Copy your draft before reloading the game page.</p>}{draft.id&&<button className="small" disabled={locked||detail.loading} onClick={()=>{if(!dirty||window.confirm('Discard your draft and reload this page from the game?')){setDraft(d=>({...empty(),id:d.id}));detail.refresh();setError('')}}}>Reload game page</button>}
 <div className="row"><button className="primary" disabled={locked||!loaded||!dirty||changed} onClick={()=>void save()}>{saving?'Saving…':'Save to game'}</button>{draft.id&&<button className="stop" disabled={locked||!loaded||changed} onClick={()=>void save(true)}>Delete page</button>}</div>{message&&<p role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}</div></div></section>;
}
