import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
import type { User } from "../permissions.ts";
import type { AuditDto } from "../../../../packages/shared/src/contracts.ts";
export const auditContext=new AsyncLocalStorage<{request_id:string;source_ip:string|null}>();
const safeFields=new Set(["id","name","type","status","approved","role","org_id","org_ids","user_id","owner_id","member_ids","project_id","task_id","assignment_id","dispatch_id","invitation_id","target_org_ids","start_date","end_date","daily_hours","all_day","progress","visibility","actions","expires_at","forced_until","version","version_number","source_version_id","previous_version_id","category","size_bytes","reason","force_reason","from","to","before","after","targets","conflicts","severity","person_id","days","capacity","peak_hours","people","tasks","projects","tools","key","value","types","enabled","parent_id","daily_standard_hours","skills"]);
export function auditSummary(value:unknown):unknown{
 if(Array.isArray(value))return value.slice(0,100).map(auditSummary);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([key])=>safeFields.has(key)).map(([key,v])=>[key,key==="value"&&(!v||typeof v!=="object")?"[redacted]":auditSummary(v)]));
 return typeof value==="string"?value.slice(0,1000):value??null;
}
export function sourceIp(peer:string|null,headers:Headers,trusted=(process.env.TRUSTED_PROXY_IPS||"").split(",").map(x=>x.trim()).filter(Boolean)):string|null{
 if(!peer||!isIP(peer))return null;
 if(!trusted.includes(peer))return peer;
 const chain=(headers.get("x-forwarded-for")||"").split(",").map(x=>x.trim());
 if(!chain.length||chain.some(ip=>!isIP(ip)))return peer;
 for(let i=chain.length-1;i>=0;i--)if(!trusted.includes(chain[i]!))return chain[i]!;
 return chain[0]||peer;
}
// Pass the caller's transaction; never start a separate transaction for business audit.
export async function addAudit(tx:any,user:User|null,action:string,kind:string,objectId:string,data:unknown={},result:AuditDto["result"]="success"){
 if(!tx)return;
 const summary=auditSummary(data) as Record<string,unknown>|null,context=auditContext.getStore();
 const envelope:AuditDto={tenant_id:user?.tenant_id??null,actor:user?.id??null,action,object_kind:kind,object_id:objectId,server_time:new Date().toISOString(),source_ip:context?.source_ip??null,request_id:context?.request_id??null,before:summary?.before??null,after:summary?.after??null,details:summary,reason:typeof summary?.reason==="string"?summary.reason:null,result};
 await tx`INSERT INTO nexusflow.audit(id,actor,tenant_id,action,object_kind,object_id,data) VALUES(${crypto.randomUUID()},${envelope.actor},${envelope.tenant_id},${action},${kind},${objectId},${tx.json(envelope as any)})`;
}
