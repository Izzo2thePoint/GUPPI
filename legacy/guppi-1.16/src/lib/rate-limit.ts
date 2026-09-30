// Browser timers clamp overflowing delays to a few milliseconds. Reject an
// unreasonable server delay instead of accidentally hammering its rate limit.
const MAX_DELAY=86400000;
function bounded(delay:number){
 if(!Number.isFinite(delay)||delay>MAX_DELAY)throw Error('The game supplied a rate-limit wait longer than 24 hours or an invalid limit. This request was stopped. Check the game before retrying any accepted order.');
 return Math.max(1000,delay);
}
export function retryAfterDelay(value:unknown,now=Date.now()):number{
 if(value===null||value===undefined||value==='')return 60000;
 const seconds=Number(value);
 if(!Number.isNaN(seconds))return seconds>0?bounded(seconds*1000):60000;
 const date=typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(date)?bounded(date-now):60000;
}
export function rateResetDelay(value:unknown,now=Date.now()):number{
 if(value===null||value===undefined||value==='')return 60000;
 const seconds=Number(value);
 return Number.isNaN(seconds)||seconds<=0?60000:bounded(seconds*1000-now);
}
