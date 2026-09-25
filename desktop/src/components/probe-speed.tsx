import {useLiveData,type ReadGame} from './live-data';
import {api,probeGet} from '@/lib/workshop';
export function speedLabel(probe:any){if(['idle','orbiting'].includes(probe?.status))return '0 c';const v=probe?.movement?.estimatedVelocityC;if(typeof v==='number'&&Number.isFinite(v)&&v>=0)return `${v.toFixed(4)} c · ${(v*100).toFixed(2)}%`;return 'Unavailable';}
export function ProbeSpeed({probe,connected,probeId,read}:{probe:any;connected:boolean;probeId:string;read:ReadGame}){
 const moving=['preparing','accelerating','cruising','decelerating'].includes(probe?.status);
 const live=useLiveData(connected&&moving,signal=>read(api(probeGet),signal),probeId,true);
 return <div className="probe-speed"><span>Probe speed</span><strong aria-label="Probe speed">{speedLabel(probe)}</strong><small>{moving?'Game estimate · refreshes every 15s':'Relative to the system'}</small>{live.error&&<small role="status">Speed refresh failed; showing last report.</small>}</div>;
}
