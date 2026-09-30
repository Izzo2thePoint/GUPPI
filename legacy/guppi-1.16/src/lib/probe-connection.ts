import type {Command} from './engine';
import {api,probeGet,manniesGet,sectorGet} from './workshop';
export class GameApiError extends Error{
 code:string;
 constructor(public status:number,data:any){
  const error=data?.error,code=typeof error?.code==='string'?error.code:'',detail=typeof error==='string'?error:typeof error?.message==='string'?error.message:typeof data?.message==='string'?data.message:JSON.stringify(data)?.slice(0,450)||'No error details';
  super(`Game HTTP ${status}: ${detail}`);this.name='GameApiError';this.code=code;
 }
}
/** Authentication and core probe state are required; optional telemetry must not prevent connection. */
export async function loadProbeTelemetry(probeId:string,send:(c:Command)=>Promise<any>,signal:AbortSignal){
 const p=await send(api(probeGet));if(!p?.probe||String(p.probe.id)!==probeId)throw Error('The game did not return the selected probe.');
 const warnings:string[]=[];
 for(const [operation,label,field] of [[manniesGet,'Manny status','mannies'],[sectorGet,'External sensors','sector'],['GET /api/probe/{probeId}/visited-sectors','Visit history','visitedSectors']]){
  if(signal.aborted)throw Error('Stopped');
  try{const result=await send(api(operation));if(!result?.[field])throw Error('No data returned.');}
  catch(e){if(signal.aborted||e instanceof GameApiError&&[401,403].includes(e.status))throw e;warnings.push(`${label}: ${e instanceof GameApiError&&e.code==='sensors_unavailable'?'unavailable at the probe’s current speed. Onboard features remain available.':e instanceof Error?e.message:String(e)}`);}
 }
 if(signal.aborted)throw Error('Stopped');
 return warnings.join(' ');
}
