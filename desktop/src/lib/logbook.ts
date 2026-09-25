export const logbookList='GET /api/probe/{probeId}/logbook-pages';
export const logbookRead='GET /api/probe/{probeId}/logbook-page/{logbookPageId}';
export const logbookCreate='POST /api/probe/{probeId}/logbook-page';
export const logbookUpdate='PATCH /api/probe/{probeId}/logbook-page/{logbookPageId}';
export const logbookDelete='DELETE /api/probe/{probeId}/logbook-page/{logbookPageId}';
export type LogbookPage={id:number;probeId:number;title:string;content:string;updatedAt:string;createdAt:string;sortOrder:number};
export function logbookBody(title:string,content:string){
 if(typeof title!=='string'||!title.trim()||title.length>120)throw Error('Use a title of 1–120 characters.');
 if(typeof content!=='string'||!content.trim()||content.length>20000)throw Error('Use logbook text of 1–20,000 characters.');
 return {title,content};
}
export function sameLogbookPage(a:LogbookPage,b:LogbookPage){return a.id===b.id&&a.probeId===b.probeId&&a.title===b.title&&a.content===b.content&&a.updatedAt===b.updatedAt;}
