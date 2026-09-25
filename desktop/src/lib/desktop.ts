import type {ArchivedSystem} from './system-archive';
import type {Coord} from './navigation';
export type MapSnapshot={origin:Coord|null;readings:ArchivedSystem[];route:Coord[];selected:Coord|null;savedOnly:boolean;archiveId:string;connected:boolean;updated:number};
export type DesktopSettings={closeToTray:boolean;notifications:boolean;version?:string;trayAvailable?:boolean};
declare global{interface Window{guppiDesktop?:{
 settings:()=>Promise<DesktopSettings>;saveSettings:(v:DesktopSettings)=>Promise<DesktopSettings>;
 openMap:()=>Promise<void>;publishMap:(v:MapSnapshot)=>Promise<void>;mapSnapshot:()=>Promise<MapSnapshot|null>;selectSystem:(v:Coord)=>Promise<void>;
 notify:(v:{title:string;body:string;target:'alerts'|'messaging'|'jobs'})=>Promise<boolean>;activity:(active:boolean)=>Promise<void>;hide:()=>Promise<void>;quit:()=>Promise<void>;
 onMap:(cb:(v:MapSnapshot)=>void)=>(()=>void);onSelect:(cb:(v:Coord)=>void)=>(()=>void);onAction:(cb:(v:string)=>void)=>(()=>void);
}}}
export function notifyDesktop(title:string,body:string,target:'alerts'|'messaging'|'jobs'='jobs'){void window.guppiDesktop?.notify({title:title.slice(0,100),body:body.slice(0,500),target}).catch(()=>{});}
