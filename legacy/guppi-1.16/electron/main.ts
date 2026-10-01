import {setupDesktop} from './desktop-native';
import {app,BrowserWindow,dialog,Menu,protocol,session,shell} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {APP_ORIGIN,commandResponse} from './api';
import {runSelfTest,fixtureTransport} from './self-test';

const selfTest=process.argv.includes('--self-test');
const testRun=process.argv.find(a=>a.startsWith('--test-run='))?.slice('--test-run='.length);
if(selfTest&&testRun!==undefined&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(testRun))throw Error('Invalid diagnostic run name.');
const reportArg=process.argv.find(a=>a.startsWith('--test-report='));
const reportPath=reportArg?.slice('--test-report='.length);
const bridgeToken=randomBytes(32).toString('hex');
if(selfTest)app.disableHardwareAcceleration();
const dataDirectory=selfTest?path.join(app.getPath('temp'),'neumann-cockpit-self-test'+(testRun?'-'+testRun:'')):path.join(app.getPath('appData'),'Neumann Mission Cockpit');
app.setPath('userData',dataDirectory);app.setPath('sessionData',dataDirectory);
protocol.registerSchemesAsPrivileged([{scheme:'neumann',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
let mainWindow:BrowserWindow|null=null;
const diagnostics:string[]=[];
function localURL(raw:string){try{const u=new URL(raw);return u.protocol==='neumann:'&&u.hostname==='cockpit'&&!u.port&&!u.username&&!u.password}catch{return false}}
function externalURL(raw:string){try{const u=new URL(raw);return u.protocol==='https:'&&['neumann-probe.net','science.nasa.gov'].includes(u.hostname)&&!u.port&&!u.username&&!u.password}catch{return false}}
function openExternal(raw:string){if(!selfTest&&externalURL(raw))void shell.openExternal(raw);}

if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(mainWindow?.isMinimized())mainWindow.restore();mainWindow?.focus()});
 app.whenReady().then(async()=>{
  const desktop=await setupDesktop(dataDirectory,selfTest,localURL);
  app.on('second-instance',()=>desktop.show());
  const root=path.join(app.getAppPath(),'renderer');
  protocol.handle('neumann',async request=>{
   if(selfTest)diagnostics.push('Protocol '+request.method+' '+new URL(request.url).pathname);
   if(!localURL(request.url))return new Response('Forbidden',{status:403});
   const url=new URL(request.url);
   if(url.pathname==='/api/command')return commandResponse(request,selfTest?fixtureTransport:undefined,bridgeToken);
   if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
   try{
    const pathname=decodeURIComponent(url.pathname);
    if(pathname.includes('\\')||pathname.includes('\0'))return new Response('Forbidden',{status:403});
    const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!target.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
    let body=await fs.readFile(target);
    if(path.extname(target)==='.html')body=Buffer.from(body.toString('utf8').replace('<head>',`<head><meta name="desktop-bridge-token" content="${bridgeToken}">`));
    const response=new Response(request.method==='HEAD'?null:new Uint8Array(body),{headers:{'Content-Type':types[path.extname(target)]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
    if(selfTest)diagnostics.push('Response '+response.status+' '+body.length+' bytes');
    return response;
   }catch(e){if(selfTest)diagnostics.push('Asset error '+String(e));return new Response('Not found',{status:404})}
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  // The renderer only speaks to its local bridge. The bridge alone contacts the fixed game host.
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const cancel=!localURL(details.url)&&!details.url.startsWith('devtools:');if(selfTest&&cancel)diagnostics.push('Blocked '+details.url);callback({cancel})});
  mainWindow=new BrowserWindow({...desktop.bounds('main'),minWidth:980,minHeight:700,show:!selfTest,backgroundColor:'#0b1723',title:'GUPPI',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false,spellcheck:false}});
  const win=mainWindow;desktop.attach(win);
  if(selfTest&&process.argv.includes('--show-test-window'))win.once('ready-to-show',()=>win.showInactive());
  if(selfTest)win.webContents.on('render-process-gone',(_event,details)=>diagnostics.push('Renderer exited '+JSON.stringify(details)));
  win.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'}});
  win.webContents.on('will-navigate',(event,url)=>{if(!localURL(url)){event.preventDefault();openExternal(url)}});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('will-prevent-unload',event=>{
   if(selfTest||desktop.isQuitting()){event.preventDefault();return;}
   const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['Keep open','Close cockpit'],defaultId:0,cancelId:0,title:'Automation is active',message:'Close the cockpit and stop future commands?',detail:'Tasks already accepted by the game continue. Keep the app open and your PC awake to run the rest of the routine.'});
   if(choice===1)event.preventDefault();
  });
  win.on('closed',()=>{mainWindow=null});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'File',submenu:[{label:'Open game',click:()=>openExternal('https://neumann-probe.net/')},{type:'separator'},{label:'Connection settings',accelerator:'CommandOrControl+K',click:()=>desktop.action('connection')},{label:'Desktop settings',accelerator:'CommandOrControl+,',click:()=>desktop.action('settings')},{type:'separator'},{label:'Quit GUPPI',accelerator:'CommandOrControl+Q',click:()=>desktop.quit()}]},
   {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
   {label:'View',submenu:[{label:'Fleet overview',accelerator:'CommandOrControl+0',click:()=>desktop.action('section:overview')},{label:'System map window',accelerator:'CommandOrControl+Shift+M',click:()=>void desktop.openMap()},{label:'Toggle jobs tray',accelerator:'CommandOrControl+J',click:()=>desktop.action('jobs')},{label:'Refresh probe',accelerator:'CommandOrControl+R',click:()=>desktop.action('refresh')},...['Sensors and Navigation','Mining','Inventory','Crafting','Build probe','Automation cockpit','Logbook','Mannys'].map((label,i)=>({label,accelerator:'CommandOrControl+'+(i+1),click:()=>desktop.action('section:'+['sensors','mining','inventory','crafting','construction','automation','logbook','mannies'][i])})),{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
   {label:'Help',submenu:[{label:'Game API reference',click:()=>openExternal('https://neumann-probe.net/api-docs')},{label:'About',click:()=>void dialog.showMessageBox(win,{type:'info',title:'GUPPI',message:`GUPPI ${app.getVersion()}`,detail:'Independent desktop companion for Neumann Probe. Requires internet and your personal game API key. Routines are saved locally; your key stays in memory. Keep the app open and your PC awake for automation.'})}]}
  ]));
  const errors:string[]=[];
  if(selfTest)win.webContents.on('console-message',(_event,level,message)=>{if(level===3)errors.push(message)});
  await win.loadURL(APP_ORIGIN+'/');
  if(selfTest){
   try{const result=await runSelfTest(win,errors);await desktop.flush();if(reportPath){await fs.writeFile(reportPath,JSON.stringify(result,null,2));if(process.argv.includes('--archive-reopen-check'))await fs.writeFile(reportPath+'.png',(await win.webContents.capturePage()).toPNG());}if(!process.argv.includes('--keep-test-open'))app.exit(0)}
   catch(e){if(reportPath)await fs.writeFile(reportPath,JSON.stringify({passed:false,error:e instanceof Error?e.stack:String(e),errors,diagnostics,ui:await win.webContents.executeJavaScript('document.body.innerText')},null,2));app.exit(1)}
  }
 }).catch(async e=>{if(selfTest&&reportPath)await fs.writeFile(reportPath,JSON.stringify({passed:false,error:String(e),diagnostics}));else dialog.showErrorBox('Unable to start cockpit',String(e));app.exit(1)});
 app.on('window-all-closed',()=>app.quit());
}

