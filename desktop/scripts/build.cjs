const path=require('node:path');
(async()=>{
 const {build}=await import('vite'),react=(await import('@vitejs/plugin-react')).default,tailwind=(await import('@tailwindcss/postcss')).default;
 const modules=new Set();
 await build({root:process.cwd(),base:'/',resolve:{alias:{'@':path.join(process.cwd(),'src')}},plugins:[react(),{name:'collect-license-modules',generateBundle(_opts,bundle){for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const id of Object.keys(chunk.modules))modules.add(id)}}],css:{postcss:{plugins:[tailwind()]}},build:{outDir:'renderer',emptyOutDir:true,sourcemap:false}});
 const fs=require('node:fs/promises'),ts=require('typescript');
 const licenses=new Map();
 for(const id of modules){
  if(!id.includes('node_modules'))continue;
  let dir=path.dirname(id.replace(/\?.*$/,''));
  while(dir.includes('node_modules')){
   try{const pkg=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));if(pkg.name){const texts=[];for(const file of await fs.readdir(dir))if(/^(license|licence|notice)(\.|$)/i.test(file)){try{texts.push(await fs.readFile(path.join(dir,file),'utf8'))}catch{}}licenses.set(pkg.name+'@'+pkg.version,`${pkg.name} ${pkg.version}\nLicense: ${pkg.license||'See notice'}\n${texts.join('\n')}`);break}}catch{}
   const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
  }
 }
 await fs.writeFile('renderer/THIRD-PARTY-NOTICES.txt','Third-party components included in the desktop interface.\nElectron and Chromium notices are included with the packaged runtime.\n\n'+[...licenses.values()].join('\n\n'+'='.repeat(72)+'\n\n'));
 for(const file of ['electron/preload.ts','electron/desktop-native.ts','electron/main.ts','electron/api.ts','electron/self-test.ts','electron/operations-fixture.ts','electron/inventory-fixture.ts','electron/fleet-fixture.ts','src/lib/engine.ts']){
  const out=path.join('build',file.replace(/\.ts$/,'.js'));
  await fs.mkdir(path.dirname(out),{recursive:true});
  const result=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
  await fs.writeFile(out,result.outputText);
 }
 await fs.copyFile('src/lib/catalog.json','build/src/lib/catalog.json');
})().catch(e=>{console.error(e);process.exitCode=1});

