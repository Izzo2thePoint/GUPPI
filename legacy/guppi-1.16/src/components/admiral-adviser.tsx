import {useCallback,useEffect,useRef,useState} from 'react';
import {actionBriefing,facts,probeBriefing,sectionBriefings,type Briefing} from '@/lib/admiral';

type Preferences={mode:'auto'|'quiet'|'hidden';motion:boolean};
const storageKey='guppi-admiral-v1';
function preferences():Preferences{try{const p=JSON.parse(localStorage.getItem(storageKey)||'null');return {mode:['auto','quiet','hidden'].includes(p?.mode)?p.mode:'auto',motion:p?.motion!==false}}catch{return {mode:'auto',motion:true}}}
export function AdmiralAdviser({section,probe,mannies}:{section:string;probe:any;mannies:any[]}){
 const [prefs,setPrefs]=useState(preferences),[message,setMessage]=useState<Briefing|null>(null),[talking,setTalking]=useState(false),[held,setHeld]=useState(false);
 const last=useRef(0),cursor=useRef(Math.floor(Math.random()*facts.length)),latest=useRef({probe,mannies});latest.current={probe,mannies};
 const show=useCallback((briefing:Briefing)=>{last.current=Date.now();setHeld(false);setMessage({...briefing});setTalking(true)},[]);
 const nextFact=useCallback(()=>{const i=cursor.current++;show(i%(facts.length+1)===facts.length?probeBriefing(latest.current.probe,latest.current.mannies):facts[i%(facts.length+1)]);},[show]);
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(prefs))}catch{/* Preferences still work for this session. */}},[prefs]);
 useEffect(()=>{if(prefs.mode==='auto')show(sectionBriefings[section]||sectionBriefings.sensors);else{setMessage(null);setTalking(false)}},[section,prefs.mode,show]);
 useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setTalking(false),7000);return()=>clearTimeout(timer)},[message]);
 useEffect(()=>{if(!message||held)return;const timer=setTimeout(()=>setMessage(null),20000);return()=>clearTimeout(timer)},[message,held]);
 useEffect(()=>{
  if(prefs.mode!=='auto')return;
  const click=(event:MouseEvent)=>{
   const element=event.target instanceof Element?event.target:null;
   const button=element?.closest('button');
   if(!button||button.disabled||!button.closest('.command-bridge')||button.closest('.admiral-adviser')||button.getAttribute('role')==='tab'||Date.now()-last.current<2500)return;
   // Observe only button labels, never form values, credentials, messages or game responses.
   const briefing=actionBriefing(button.getAttribute('aria-label')||button.textContent||'');if(briefing)show(briefing);
  };
  document.addEventListener('click',click);
  const timer=setInterval(()=>{if(!held&&!document.hidden&&Date.now()-last.current>85000&&!document.querySelector('[role="dialog"]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable=true]'))nextFact()},90000);
  return()=>{document.removeEventListener('click',click);clearInterval(timer)};
 },[prefs.mode,show,nextFact,held]);
 const dismiss=()=>{setMessage(null);setTalking(false);setHeld(false)};
 return <aside className={`admiral-adviser ${prefs.motion?'':'admiral-still'} ${talking&&message?'admiral-talking':''}`} aria-label="Admiral Ackbar adviser" onKeyDown={e=>{if(e.key==='Escape')dismiss()}}>
  {prefs.mode==='hidden'?<button className="admiral-restore" onClick={()=>setPrefs(p=>({...p,mode:'auto'}))}>Show adviser</button>:<>
   <button className="admiral-portrait" aria-label="Ask Admiral Ackbar for a fact" title="Admiral Ackbar · click for a fact" onClick={nextFact}><span className="admiral-sprite" aria-hidden="true"><span className="admiral-face"/></span></button>
   <details className="admiral-controls"><summary aria-label="Adviser settings" title="Adviser settings">⚙</summary><div>
    <strong>Admiral Ackbar</strong><label>Chatter<select aria-label="Adviser chatter" value={prefs.mode} onChange={e=>setPrefs(p=>({...p,mode:e.target.value as Preferences['mode']}))}><option value="auto">Tips and occasional facts</option><option value="quiet">Only when I click him</option><option value="hidden">Hide adviser</option></select></label>
    <label><input type="checkbox" aria-label="Animate adviser" checked={prefs.motion} onChange={e=>setPrefs(p=>({...p,motion:e.target.checked}))}/> Animate adviser</label><p>Text bubbles · no audio. Reduced-motion preferences are respected.</p>
   </div></details>
   {message&&<section className="admiral-bubble" aria-label="Admiral briefing" onMouseEnter={()=>setHeld(true)} onMouseLeave={()=>setHeld(false)} onFocus={()=>setHeld(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHeld(false)}}>
    <div className="admiral-bubble-heading"><strong>ACKBAR <small>{message.kind}</small></strong><button aria-label="Dismiss adviser bubble" onClick={dismiss}>×</button></div>
    <p role="status" aria-live="polite" aria-atomic="true">{message.text}</p><div className="admiral-bubble-footer">{message.source&&<a href={message.source} target="_blank" rel="noreferrer">{message.source.includes('nasa.gov')?'NASA source':'Game reference'} ↗</a>}<button onClick={nextFact}>Another fact</button></div>
   </section>}
  </>}
 </aside>;
}

