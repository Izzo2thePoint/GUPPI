'use client';

const labels:Record<string,string>={id:'ID',scutNetworks:'SCUT networks',scutCoverageStatus:'SCUT coverage',resourceAmounts:'Resource amounts (ECE)',massSolar:'Mass (solar masses)',stellarMass:'Stellar mass',minableTargets:'Mineable bodies',mannyMineable:'Manny mineable',probes:'Detected probes',objects:'Detected objects',estimatedObjects:'Estimated signals',possibleObjects:'Possible objects',relativeCoordinates:'Coordinates',knowledgeLevel:'Knowledge level',dataFreshness:'Data freshness'};
export function fieldLabel(key:string){return labels[key]||key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const title=(value:unknown,index:number)=>record(value)?String(value.name||value.label||value.title||(value.type?fieldLabel(String(value.type)):'Object '+(index+1))):'Entry '+(index+1);

// Render every reported field, including new API properties. Never derive missing
// quantities or turn an absent value into zero / a confirmed absence.
function Value({value,field}:{value:unknown;field?:string}){
 if(value===null||value===undefined)return <span className="hint">Not reported</span>;
 if(Array.isArray(value))return value.length?<div className="observation-entries">{value.map((item,i)=>record(item)?<article className="observation-object" key={i}><h4>{title(item,i)}</h4><Fields value={item}/></article>:<div className="observation-entry" key={i}><Value value={item}/></div>)}</div>:<span className="hint">None reported</span>;
 if(record(value))return Object.keys(value).length?<Fields value={value}/>:<span className="hint">No details reported</span>;
 if(typeof value==='boolean')return <span>{value?'Yes':'No'}</span>;
 if(typeof value==='string')return <span className="observation-text">{['type','status','knowledgeLevel','dataFreshness'].includes(field||'')?fieldLabel(value):value||'Empty'}</span>;
 return <span>{String(value)}</span>;
}
function Fields({value}:{value:Record<string,unknown>}){return <dl className="observation-fields">{Object.entries(value).map(([key,v])=><div key={key} className={v&&typeof v==='object'?'observation-nested':''}><dt>{fieldLabel(key)}{Array.isArray(v)&&` · ${v.length}`}</dt><dd><Value value={v} field={key}/></dd></div>)}</dl>}

export function SystemObservation({observation}:{observation:Record<string,unknown>}){
 const collections=Object.entries(observation).filter(([,v])=>Array.isArray(v)||record(v));
 const facts=Object.fromEntries(Object.entries(observation).filter(([,v])=>!Array.isArray(v)&&!record(v)));
 return <div className="system-observation"><p className="hint">All data reported by this scan. Missing details may require a closer or more complete scan.</p><Fields value={facts}/>{collections.map(([key,v])=><details className="observation-section" key={key} open><summary>{fieldLabel(key)}{Array.isArray(v)&&` · ${v.length}`}</summary><Value value={v} field={key}/></details>)}</div>;
}
