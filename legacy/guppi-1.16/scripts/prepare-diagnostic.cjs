const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),work=path.resolve(root,'../work');
 const runArg=process.argv.find(a=>a.startsWith('--test-run=')),run=runArg?.slice('--test-run='.length)||'';
 if(runArg&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(run))throw Error('Test run must be 1–64 letters, digits, hyphens, or underscores, starting with a letter or digit.');
 const suffix=run?'-'+run:'',source=path.join(root,'node_modules/electron/dist'),target=path.join(work,'desktop-diagnostic'+suffix),stage=path.join(work,'desktop-diagnostic-content'+suffix);
 await fs.cp(source,target,{recursive:true});
 await fs.mkdir(stage,{recursive:true});
 for(const dir of ['build','renderer'])await fs.cp(path.join(root,dir),path.join(stage,dir),{recursive:true});
 const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 delete manifest.devDependencies;delete manifest.scripts;delete manifest.build;
 manifest.main='diagnostic.cjs';manifest.name='neumann-desktop-diagnostic';
 await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(manifest));
 const reopen=process.argv.includes('--reopen');
 const mode=process.argv.includes('--adviser-check')?'--adviser-check':process.argv.includes('--utility-check')?'--utility-check':process.argv.includes('--inventory-check')?'--inventory-check':process.argv.includes('--fleet-check')?'--fleet-check':process.argv.includes('--operations-check')?'--operations-check':process.argv.includes('--bridge-check')?'--bridge-check':process.argv.includes('--outpost-check')?'--outpost-check':reopen?'--archive-reopen-check':'';
 const report=(mode==='--adviser-check'?'desktop-adviser-test.json':mode==='--utility-check'?'desktop-utility-test.json':mode==='--inventory-check'?'desktop-inventory-test.json':mode==='--fleet-check'?'desktop-fleet-test.json':mode==='--operations-check'?'desktop-operations-test.json':mode==='--bridge-check'?'desktop-bridge-test.json':mode==='--outpost-check'?'desktop-outpost-bridge-test.json':reopen?'desktop-archive-reopen.json':'desktop-self-test-normal.json').replace('.json',suffix+'.json');
 await fs.writeFile(path.join(stage,'diagnostic.cjs'),`process.argv.push('--self-test','--show-test-window',${JSON.stringify('--test-report='+path.join(work,report))},${JSON.stringify(mode)}${run?','+JSON.stringify('--test-run='+run):''}${process.argv.includes('--keep-test-open')?",'--keep-test-open'":''});require('./build/electron/main.js');`);
 if(reopen)await fs.appendFile(path.join(stage,'diagnostic.cjs'),"const e=require('electron');e.app.whenReady().then(()=>e.BrowserWindow.getAllWindows()[0]?.showInactive());");
 const asar=require('../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar');
 await asar.createPackage(stage,path.join(target,'resources/app.asar'));
 await fs.copyFile(path.join(target,'electron.exe'),path.join(target,'GUPPI.exe'));
 await fs.unlink(path.join(target,'electron.exe'));
 console.log(path.join(target,'GUPPI.exe'));
})().catch(e=>{console.error(e);process.exitCode=1});


