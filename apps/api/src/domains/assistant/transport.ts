import type { ApiApp } from "../../shared/http.ts";
import type { User } from "../../permissions.ts";
import { currentUser } from "../../auth.ts";
import { withRbacContext } from "../../rbac.ts";
import { createHash } from "node:crypto";
import { seal } from './secrets.ts';
export type Call = {path:string;method?:string;body?:unknown;expectedVersion?:string};
export type Runtime = {app:ApiApp;headers:Headers;user:User;conversationId:string;messageId:string;query:string;signal:AbortSignal;refs:Set<string>;secureResult?:string;emit:(type:string,payload:Record<string,any>)=>Promise<void>};
function canonical(value:any):any{if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const permissionStamp=(user:User)=>fingerprint([user.tenant_id,user.role,user.org_id,user.portal_permissions,[...(user.feature_denies||[])].sort(),user.project_overrides]);
const sensitive=/^(password|password_hash|old_password|new_password|api_key|access_token|token|token_hash|secret|authorization|cookie|object_key|portal_internal_token|encrypted_result)$/i;
export function sanitize(value:any):any {if(Array.isArray(value))return value.map(sanitize);if(value&&typeof value==="object"){if(value instanceof Date)return value.toISOString();return Object.fromEntries(Object.entries(value).filter(([key])=>!sensitive.test(key)).map(([key,v])=>[key,sanitize(v)]));}return value;}
export function internalHeaders(source:Headers){const headers=new Headers({"content-type":"application/json"});for(const key of ["authorization","cookie","x-request-id"])if(source.has(key))headers.set(key,source.get(key)!);return headers;}
export async function refreshUser(runtime:Runtime){
 const c={req:{header:(key:string)=>runtime.headers.get(key)||undefined}};
 const loaded=await currentUser(c as any);if(!loaded||loaded.id!==runtime.user.id||loaded.tenant_id!==runtime.user.tenant_id)throw Error("forbidden: login expired or identity changed");
 runtime.user=await withRbacContext(loaded);return runtime.user;
}
export async function callApi(runtime:Runtime,call:Call){
 runtime.signal.throwIfAborted();await refreshUser(runtime);
 const headers=new Headers(runtime.headers);if(call.expectedVersion)headers.set('if-match',call.expectedVersion);
 const response=await runtime.app.request(`http://nexusflow.internal${call.path}`,{method:call.method||"GET",headers,...(call.body===undefined?{}:{body:JSON.stringify(call.body)}),signal:runtime.signal});
 const type=response.headers.get("content-type")||"";if(!type.includes("application/json"))throw Error("invalid business API response");
 const value=await response.json() as any;if(!response.ok)throw Error(value.error||`business API failed (${response.status})`);
 if(call.path==='/api/invitations'&&call.method==='POST'&&typeof value.token==='string')runtime.secureResult=seal({invitation_token:value.token});
 const clean=sanitize(value);
 if((call.method||"GET")==="GET"){
  // 保存当前被读过的受保护入口；历史重放前重新鉴权，不复用旧权限快照。
  runtime.refs.add(call.path);
  const collection=call.path.match(/^\/api\/(orgs|people|projects|tasks|task_assignments|files|invitations|dispatch|approvals|conflicts|config|tools|worklogs|milestones|visibility_grants)(?:\?|$)/)?.[1];
  if(collection&&Array.isArray(value.items))for(const item of value.items)if(typeof item.id==="string")runtime.refs.add(`/api/${collection}/${encodeURIComponent(item.id)}`);
 }
 return clean;
}
export const hasAggregate=(refs:string[])=>refs.some(path=>!path.startsWith('/api/admin/users?user_id=')&&(/^\/api\/(home|reports|planning|load|gantt|admin\/users)(?:\/|\?|$)/.test(path)||/^\/api\/[a-z_]+(?:\?|$)/.test(path)));
export async function referencesAllowed(runtime:Runtime,refs:string[]){
 for(const path of refs){try{await callApi(runtime,{path});}catch{return false;}}
 return true;
}
