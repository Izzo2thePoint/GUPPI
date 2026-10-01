import {app,BrowserWindow,dialog,ipcMain,Menu,nativeImage,Notification,screen,Tray,type IpcMainInvokeEvent} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
type Settings={closeToTray:boolean;notifications:boolean};
type Bounds={x:number;y:number;width:number;height:number;maximized?:boolean};
export function restoreBounds(saved:any,areas:Electron.Rectangle[],fallback:{width:number;height:number},minimum={width:980,height:700}):Partial<Bounds>{
 if(!saved||!['x','y','width','height'].every(k=>Number.isFinite(saved[k])))return fallback;
 const area=areas.find(a=>saved.x+saved.width>a.x+80&&saved.x<a.x+a.width-80&&saved.y+saved.height>a.y+60&&saved.y<a.y+a.height-60)||areas[0];if(!area)return fallback;
 const width=Math.max(Math.min(minimum.width,area.width),Math.min(saved.width,area.width)),height=Math.max(Math.min(minimum.height,area.height),Math.min(saved.height,area.height));
 return {width,height,x:Math.max(area.x,Math.min(saved.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(saved.y,area.y+area.height-height))};
}
export async function setupDesktop(directory:string,selfTest:boolean,localURL:(url:string)=>boolean){
 const file=path.join(directory,'desktop-window-state.json');let saved:any={};try{const parsed=JSON.parse(await fs.readFile(file,'utf8'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))saved=parsed;}catch{}
 let settings:Settings={closeToTray:saved.settings?.closeToTray!==false,notifications:saved.settings?.notifications!==false},main:BrowserWindow|null=null,map:BrowserWindow|null=null,tray:Tray|null=null,quitting=false,active=false,snapshot:any=null;
 let writeChain=Promise.resolve();const persist=()=>{const json=JSON.stringify({...saved,settings});writeChain=writeChain.catch(()=>{}).then(async()=>{await fs.mkdir(directory,{recursive:true});await fs.writeFile(file+'.tmp',json);await fs.rename(file+'.tmp',file)}).catch(()=>{});};
 const bounds=(kind:string)=>restoreBounds(saved[kind],screen.getAllDisplays().map(d=>d.workArea),kind==='main'?{width:1540,height:980}:{width:1100,height:780},kind==='main'?{width:980,height:700}:{width:680,height:500});
 const remember=(win:BrowserWindow,kind:string)=>{const save=()=>{if(win.isDestroyed()||win.isMinimized())return;saved[kind]={...win.getNormalBounds(),maximized:win.isMaximized()};persist()};let timer:ReturnType<typeof setTimeout>;const later=()=>{clearTimeout(timer);timer=setTimeout(save,250)};win.on('resize',later);win.on('move',later);win.on('close',()=>{clearTimeout(timer);save()});if(saved[kind]?.maximized)win.maximize();};
 const show=()=>{if(!main||main.isDestroyed())return;main.show();if(main.isMinimized())main.restore();main.focus()};
 const action=(name:string)=>{show();main?.webContents.send('desktop:action',name)};
 const noticeAction=(name:string)=>action(name==='jobs'?'show-jobs':name);
 const quit=()=>{if(quitting)return;if(active&&!selfTest&&dialog.showMessageBoxSync(main!,{type:'question',title:'Quit GUPPI?',message:'Stop future commands and quit GUPPI?',detail:'Accepted game tasks continue. To keep sending queued orders, leave GUPPI running in the tray.',buttons:['Keep running','Quit GUPPI'],defaultId:0,cancelId:0})!==1)return;for(const [kind,win] of [['main',main],['map',map]] as const)if(win&&!win.isDestroyed()&&!win.isMinimized())saved[kind]={...win.getNormalBounds(),maximized:win.isMaximized()};persist();quitting=true;void writeChain.finally(()=>app.quit())};
 const secure=(win:BrowserWindow)=>{win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(!localURL(url))e.preventDefault()});win.webContents.on('will-attach-webview',e=>e.preventDefault())};
 const openMap=async()=>{if(map&&!map.isDestroyed()){map.show();map.focus();return;}map=new BrowserWindow({...bounds('map'),minWidth:680,minHeight:500,show:!selfTest,title:'GUPPI · System map',backgroundColor:'#0b1723',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false}});const win=map;secure(win);remember(win,'map');win.on('closed',()=>{map=null});await win.loadURL('neumann://cockpit/?window=map');};
 const trusted=(e:IpcMainInvokeEvent,mainOnly=false)=>{if(!e.senderFrame||e.senderFrame!==e.sender.mainFrame||!localURL(e.senderFrame.url)||!(e.sender===main?.webContents||!mainOnly&&e.sender===map?.webContents))throw Error('Untrusted desktop request')};
 const handle=(channel:string,mainOnly:boolean,fn:(v:any)=>any)=>ipcMain.handle(channel,(e,v)=>{trusted(e,mainOnly);return fn(v)});
 handle('desktop:settings',false,()=>({...settings,version:app.getVersion(),trayAvailable:!!tray}));
 handle('desktop:save-settings',true,v=>{if(typeof v?.closeToTray!=='boolean'||typeof v?.notifications!=='boolean')throw Error('Invalid settings');settings={closeToTray:v.closeToTray,notifications:v.notifications};persist();return {...settings,trayAvailable:!!tray}});
 handle('desktop:open-map',true,openMap);handle('desktop:map-snapshot',false,()=>snapshot);
 handle('desktop:publish-map',true,v=>{if(!v||!Array.isArray(v.readings)||!Array.isArray(v.route)||v.route.length>201||v.readings.length>100000||JSON.stringify(v).length>24000000)throw Error('Invalid map snapshot');snapshot=v;map?.webContents.send('desktop:map',v)});
 handle('desktop:select-system',false,v=>{if(!v||!['x','y','z'].every(k=>Number.isSafeInteger(v[k])&&Math.abs(v[k])<=1000000)||(v.x+v.y+v.z)%2!==0)throw Error('Invalid sector');main?.webContents.send('desktop:select',{x:v.x,y:v.y,z:v.z})});
 let lastNotice=new Map<string,number>(),balloonTarget='alerts';
 handle('desktop:notify',true,v=>{if(!settings.notifications||!v||typeof v.title!=='string'||typeof v.body!=='string'||v.title.length>100||v.body.length>500||!['alerts','messaging','jobs'].includes(v.target))return false;const key=v.title+v.body,time=Date.now();if(time-(lastNotice.get(key)||0)<60000)return false;lastNotice.set(key,time);if(lastNotice.size>100)lastNotice=new Map([...lastNotice].slice(-50));if(selfTest)return true;const balloon=()=>{if(tray){balloonTarget=v.target;tray.displayBalloon({title:v.title,content:v.body,iconType:'info'})}};if(!Notification.isSupported()){balloon();return !!tray;}const n=new Notification({title:v.title,body:v.body,silent:false});n.on('click',()=>noticeAction(v.target));n.on('failed',balloon);try{n.show()}catch{balloon()}return true});
 handle('desktop:activity',true,v=>{active=v===true;tray?.setToolTip(active?'GUPPI · Automation active':'GUPPI · Command bridge')});
 handle('desktop:hide',true,()=>{if(tray)main?.hide();else main?.minimize()});handle('desktop:quit',true,quit);
 return {flush:()=>writeChain,bounds,show,action,openMap,quit,isQuitting:()=>quitting,attach(win:BrowserWindow){main=win;remember(win,'main');app.setAppUserModelId('net.neumannprobe.missioncockpit');
   // Small opaque G glyph, generated locally without external assets.
   const pixels=Buffer.alloc(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;const on=(x>=7&&x<=11&&y>=7&&y<=25)||(y>=7&&y<=11&&x>=7&&x<=25)||(y>=21&&y<=25&&x>=7&&x<=25)||(x>=21&&x<=25&&y>=16&&y<=25)||(y>=15&&y<=18&&x>=16&&x<=25);pixels[i]=on?122:27;pixels[i+1]=on?238:23;pixels[i+2]=on?185:11;pixels[i+3]=255;}
   try{tray=new Tray(nativeImage.createFromBitmap(pixels,{width:32,height:32}));tray.setToolTip('GUPPI · Command bridge');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open GUPPI',click:show},{label:'System map',click:()=>void openMap()},{label:'Connection settings',click:()=>action('connection')},{type:'separator'},{label:'Quit GUPPI',click:quit}]));tray.on('click',show)}catch{}
   tray?.on('balloon-click',()=>noticeAction(balloonTarget));
   win.on('close',e=>{if(!quitting&&settings.closeToTray&&tray){e.preventDefault();win.hide()}else if(!quitting){e.preventDefault();quit()}});
   app.on('before-quit',()=>{quitting=true});
  }};
}
