"use client";

import { unwrapList } from "../../../packages/shared/src/contracts";
import type { ApiRecord } from "../../../packages/shared/src/index";
export function apiBase():string{
 if(typeof window==="undefined")return "";
 const p=window.location.pathname;return p==="/nexusflow"||p.startsWith("/nexusflow/")?"/nexusflow":"";
}
export class ApiError extends Error{
 constructor(public status:number,message:string,public request_id?:string,public code?:string){super(message);}
}
export function token():string|null{return typeof window==="undefined"?null:localStorage.getItem("nf_token");}
let epoch=0,lastToken:string|null=null,identity="",tenant:string|null=null;
const listeners=new Set<()=>void>();
export const subscribeSession=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
export const sessionEpoch=()=>epoch;
export const sessionTenant=()=>tenant;
function changeSession(){epoch++;for(const listener of listeners)listener();}
export const invalidateSessionCache=changeSession;
export function resetApiSession(){identity="";tenant=null;lastToken=token();changeSession();}
function syncToken(){const current=token();if(current!==lastToken){lastToken=current;identity="";tenant=null;changeSession();}}
export async function api<T=unknown>(path:string,init?:RequestInit):Promise<T>{
 syncToken();const requestEpoch=epoch,headers=new Headers(init?.headers);
 const assertCurrent=(request_id?:string)=>{
  syncToken();
  if(requestEpoch!==epoch)throw new ApiError(409,"session changed; retry request",request_id,"SESSION_CHANGED");
 };
 if(!headers.has("content-type")&&!(init?.body instanceof FormData))headers.set("content-type","application/json");
 const t=token();if(t)headers.set("authorization",`Bearer ${t}`);
 let res:Response;
 try{res=await fetch(`${apiBase()}/api${path}`,{...init,headers});}catch(error){assertCurrent();throw error;}
 const request_id=res.headers.get("x-request-id")||undefined;
 // Storage may have changed without another API request. Check before any 401/auth side effect.
 assertCurrent(request_id);
 if(res.status===401&&typeof window!=="undefined"&&!path.startsWith("/auth/")){
  resetApiSession();window.location.href=`${apiBase()}/login`;throw new ApiError(401,"unauthorized",request_id);
 }
 if(!res.headers.get("content-type")?.toLowerCase().includes("application/json"))throw new ApiError(res.ok?502:res.status,"API returned non-JSON response",request_id);
 let data:unknown;try{data=await res.json();}catch{assertCurrent(request_id);throw new ApiError(res.ok?502:res.status,"API returned invalid JSON",request_id);}
 // Body decoding is asynchronous too; auth endpoints must obey the same ownership check.
 assertCurrent(request_id);
 if(!res.ok)throw new ApiError(res.status,(data as {error?:string})?.error||res.statusText,request_id);
 if(path==="/auth/logout")resetApiSession();
 if(path==="/auth/login"||path==="/auth/me"){
  if(path==="/auth/login"&&typeof (data as any)?.access_token==="string")lastToken=(data as any).access_token;
  const user=path==="/auth/me"?data:(data as any)?.user;
  if(user&&typeof user.id==="string"){
   const next=JSON.stringify([user.id,user.tenant_id??null]);
   if(next!==identity){identity=next;tenant=user.tenant_id??null;changeSession();}
  }
 }
 return data as T;
}
export type Item=ApiRecord;
export const listItems=(kind:string)=>api<unknown>(`/${kind}`).then(unwrapList<Item>);
