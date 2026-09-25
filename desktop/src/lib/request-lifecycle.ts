export class CommandResponseError extends Error{
 constructor(message:string,public retryable=false){super(message);this.name='CommandResponseError';}
}
export async function readCommandResponse(response:Response):Promise<any>{
 if(response.type==='opaqueredirect'||response.redirected||(response.status===401||response.status===403)&&!(response.headers.get('content-type')||'').includes('json'))throw new CommandResponseError('The desktop connection was rejected. Restart the app and reconnect your probe.');
 const text=await response.text();
 if(!text.trim())throw new CommandResponseError(`The cockpit returned an empty response (HTTP ${response.status}). Please restart the app.`,true);
 if((response.headers.get('content-type')||'').includes('text/html')||/^\s*</.test(text))throw new CommandResponseError('The connection returned a web page instead of game data. Check the game service and reconnect your probe.');
 let result:any;
 try{result=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new CommandResponseError(`The cockpit response was incomplete or not valid JSON (HTTP ${response.status}). Please restart the app.`,true);}
 if(!result||typeof result!=='object'||Array.isArray(result)||response.ok&&(!Number.isInteger(result.status)||result.status<100||result.status>599||!Object.prototype.hasOwnProperty.call(result,'data')))throw new CommandResponseError('The cockpit returned an unexpected response format. Restart the app and reconnect.',true);
 return result;
}
/** Bound the entire response, including a stalled body, without retrying a mutation. */
export async function fetchCommand(input:RequestInfo|URL,init:RequestInit,signal:AbortSignal,timeoutMs=40000):Promise<{response:Response;result:any}>{
 const abort=new AbortController();let timedOut=false;
 const stopped=()=>abort.abort();signal.addEventListener('abort',stopped,{once:true});
 if(signal.aborted)abort.abort();
 const timer=setTimeout(()=>{timedOut=true;abort.abort()},timeoutMs);
 try{const headers=new Headers(init.headers);const bridgeToken=document.querySelector<HTMLMetaElement>('meta[name="desktop-bridge-token"]')?.content;if(bridgeToken)headers.set('X-Desktop-Token',bridgeToken);const response=await fetch(input,{...init,headers,cache:'no-store',credentials:'same-origin',redirect:'manual',signal:abort.signal});const result=await readCommandResponse(response);return {response,result};}
 catch(e){if(signal.aborted)throw Error('Stopped');if(timedOut)throw Error('The request timed out. Controls are available again. Check the game before repeating an order; it may already have been accepted.');if(e instanceof Error&&e.name==='SyntaxError')throw new CommandResponseError('The app could not read the game response. Restart the app and reconnect your probe.',true);throw e;}
 finally{clearTimeout(timer);signal.removeEventListener('abort',stopped);}
}
