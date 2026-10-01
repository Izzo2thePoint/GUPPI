import {useEffect,useState} from 'react';
import {SectorMap} from './sector-map';
import {coordKey,type Coord} from '@/lib/navigation';
import type {MapSnapshot} from '@/lib/desktop';
export function MapWindow(){
 const [snapshot,setSnapshot]=useState<MapSnapshot|null>(null),[error,setError]=useState('');
 useEffect(()=>{document.title='GUPPI · System map';const remove=window.guppiDesktop?.onMap(setSnapshot);void window.guppiDesktop?.mapSnapshot().then(setSnapshot).catch(e=>setError(String(e)));return remove},[]);
 const select=(coord:Coord)=>{setSnapshot(s=>s?{...s,selected:coord}:s);void window.guppiDesktop?.selectSystem(coord).catch(e=>setError(String(e)))};
 const selected=snapshot?.readings.find(r=>snapshot.selected&&coordKey(r.coord)===coordKey(snapshot.selected));
 return <main className="detached-map"><header><strong>GUPPI · System map</strong><span>Probe archive {snapshot?.archiveId||'—'} · {snapshot?.connected?'Connected':'Offline archive'}</span></header>{snapshot?<><SectorMap {...snapshot} onSelect={select}/><section className="detached-selection"><strong>{selected?.bookmark?.name||'Selected sector'} {snapshot.selected&&coordKey(snapshot.selected)}</strong><span>{selected?.bookmark?.notes||'Select a system to inspect it in the main window.'}</span><small>Shared filters, plotted course, and selection · {new Date(snapshot.updated).toLocaleTimeString()}</small></section></>:<p>Waiting for the main window’s system archive…</p>}{error&&<p className="error">{error}</p>}</main>;
}
