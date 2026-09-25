export type InboxMark={ids:string[];newest:number;count:number};
export function inboxMark(records:any[],count=records.length):InboxMark{return {ids:records.map(r=>String(r.id)),newest:records.reduce((n,r)=>Math.max(n,Date.parse(r.createdAt)||0),0),count};}
export function newInboxItems(previous:InboxMark,next:InboxMark){return next.ids.some(id=>!previous.ids.includes(id))&&(next.newest>previous.newest||next.count>previous.count);}
