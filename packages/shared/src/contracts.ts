export interface ListDto<T> { items:T[]; total:number; page:number; page_size:number }
export interface ErrorDto { error:string; code:string; request_id:string }
export interface AuditDto {
 tenant_id:string|null; actor:string|null; action:string; object_kind:string; object_id:string;
 server_time:string; source_ip:string|null; request_id:string|null;
 before:unknown; after:unknown; reason:string|null; result:"success"|"denied"|"failure"; details?:unknown;
}
export function listDto<T>(items:T[],query:Record<string,string|undefined>={}):ListDto<T>{
 const explicit=query.page!==undefined||query.page_size!==undefined;
 const page=Number(query.page??1),page_size=Number(query.page_size??(explicit?50:Math.max(items.length,1)));
 if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(page_size)||page_size<1||(explicit&&page_size>500))throw new Error("invalid pagination: page >= 1, page_size 1..500 required");
 return {items:explicit?items.slice((page-1)*page_size,page*page_size):items,total:items.length,page,page_size};
}
export function unwrapList<T>(value:unknown):T[]{
 if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray((value as any).items))throw new Error("invalid list DTO: items array required");
 for(const key of ["total","page","page_size"]){const n=(value as any)[key];if(n!==undefined&&(!Number.isSafeInteger(n)||n<(key==="total"?0:1)))throw new Error(`invalid list DTO: ${key}`);}
 return (value as {items:T[]}).items;
}
