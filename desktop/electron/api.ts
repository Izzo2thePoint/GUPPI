import {compile,type Command} from '../src/lib/engine';

export const APP_ORIGIN='neumann://cockpit';
export type Transport=(url:string,init:RequestInit)=>Promise<Response>;
const headers={'Cache-Control':'no-store'};
// Redact values before serialization: replacing inside JSON can corrupt escaped strings.
export function redactSecret(value:unknown,key:string):unknown{
 if(typeof value==='string')return value.split(key).join('[redacted]');
 if(Array.isArray(value))return value.map(item=>redactSecret(item,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[name.split(key).join('[redacted]'),redactSecret(item,key)]));
 return value;
}
export async function commandResponse(request:Request,transport:Transport=fetch,bridgeToken:string):Promise<Response>{
 const url=new URL(request.url);
 const origin=request.headers.get('origin');
 if(url.protocol!=='neumann:'||url.hostname!=='cockpit'||!bridgeToken||request.headers.get('x-desktop-token')!==bridgeToken||(origin!==null&&origin!=='null'&&origin!==APP_ORIGIN))
  return Response.json({error:'Commands must come from the desktop cockpit.'},{status:403,headers});
 if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers});
 const key=request.headers.get('x-probe-key')?.trim();
 if(!key||key.length>4096)return Response.json({error:'Enter a personal game API key.'},{status:401,headers});
 let payload:{command:Command;probeId:string},resolved:ReturnType<typeof compile>;
 try{
  const text=await request.text();if(text.length>64000)throw Error('Command is too large');
  payload=JSON.parse(text);
  if(typeof payload.probeId!=='string'||!payload.command||typeof payload.command.operation!=='string')throw Error('Invalid command');
  resolved=compile(payload.command,payload.probeId);
  if(!resolved.path.startsWith('/api/'))throw Error('Invalid game API path');
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Invalid command'},{status:400,headers});}
 try{
  const response=await transport('https://neumann-probe.net'+resolved.path,{
   method:resolved.op.method,headers:{Authorization:`Bearer ${key}`,Accept:'application/json',...(resolved.op.body!==null?{'Content-Type':'application/json'}:{})},
   ...(resolved.op.body!==null?{body:JSON.stringify(payload.command.body)}:{}),redirect:'manual',signal:AbortSignal.timeout(25000)
  });
  const text=await response.text();let data:unknown;
  try{data=response.status===204&&!text.trim()?null:JSON.parse(text)}catch{throw Error('Unreadable game response')}
  data=redactSecret(data,key);
  return Response.json({data,status:response.status,retryAfter:response.headers.get('retry-after'),remaining:response.headers.get('x-ratelimit-remaining'),reset:response.headers.get('x-ratelimit-reset')},{headers});
 }catch{return Response.json({error:'No confirmed response from the game. Execution stopped; check the game before retrying an order.'},{status:502,headers});}
}
