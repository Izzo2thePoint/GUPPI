const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {checkConstructionAccess}=require('../src/lib/construction-access.ts');
const session={controller:new AbortController(),probeId:'1',jobIds:['j']},jobs=[{id:'j',status:'crafting',mannyId:'reserved',builder:'assistant'}];
const command=(operation,params={},body=null)=>({operation,params,body});
const allowed=[command('GET /api/probe/{probeId}'),command('GET /api/sector'),command('POST /api/probe/{probeId}/messages'),command('PATCH /api/probe/{probeId}/alerts/{alertId}'),command('PATCH /api/probe/{probeId}/messages/{messageId}/read'),command('POST /api/probe/{probeId}/mannies/{mannyId}/craft',{mannyId:'other'})];
for(const c of allowed)assert.doesNotThrow(()=>checkConstructionAccess(c,'1',session,jobs));
const blocked=[command('POST /api/probe/{probeId}/move'),command('DELETE /api/probe/{probeId}/move'),command('POST /api/probe/{probeId}/atomic-printer/craft'),command('POST /api/probe/{probeId}/mannies/{mannyId}/craft',{mannyId:'reserved'}),command('POST /api/probe/{probeId}/mannies/{mannyId}/recall',{mannyId:'assistant'}),command('POST /api/probe/{probeId}/mannies/tasks',{}, {tasks:[{mannyId:'reserved',task:'mine'}]})];
for(const c of blocked){assert.throws(()=>checkConstructionAccess(c,'1',session,jobs),/Stop the crafting queue/);assert.doesNotThrow(()=>checkConstructionAccess(c,'2',session,jobs));assert.doesNotThrow(()=>checkConstructionAccess(c,'1',session,jobs,session.controller.signal));assert.doesNotThrow(()=>checkConstructionAccess(c,'1',session,[{...jobs[0],status:'done'}]));}
session.controller.abort();for(const c of blocked)assert.doesNotThrow(()=>checkConstructionAccess(c,'1',session,jobs));
console.log('PASS: reads, messaging, other crew/probes remain available; active builders/movement guarded; own queue allowed; reservations release on stop/completion');
