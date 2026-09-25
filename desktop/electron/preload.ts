import {contextBridge,ipcRenderer} from 'electron';
const listen=(channel:string,callback:(value:any)=>void)=>{const fn=(_event:unknown,value:any)=>callback(value);ipcRenderer.on(channel,fn);return ()=>ipcRenderer.removeListener(channel,fn)};
contextBridge.exposeInMainWorld('guppiDesktop',{
 settings:()=>ipcRenderer.invoke('desktop:settings'),
 saveSettings:(settings:unknown)=>ipcRenderer.invoke('desktop:save-settings',settings),
 openMap:()=>ipcRenderer.invoke('desktop:open-map'),
 mapSnapshot:()=>ipcRenderer.invoke('desktop:map-snapshot'),
 publishMap:(snapshot:unknown)=>ipcRenderer.invoke('desktop:publish-map',snapshot),
 selectSystem:(coord:unknown)=>ipcRenderer.invoke('desktop:select-system',coord),
 notify:(notice:unknown)=>ipcRenderer.invoke('desktop:notify',notice),
 activity:(active:boolean)=>ipcRenderer.invoke('desktop:activity',active),
 hide:()=>ipcRenderer.invoke('desktop:hide'),
 quit:()=>ipcRenderer.invoke('desktop:quit'),
 onMap:(callback:(value:any)=>void)=>listen('desktop:map',callback),
 onSelect:(callback:(value:any)=>void)=>listen('desktop:select',callback),
 onAction:(callback:(value:string)=>void)=>listen('desktop:action',callback)
});
