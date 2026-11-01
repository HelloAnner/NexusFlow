import { apiBase, token } from "./api";
import { readExecutionEvents } from '../../../packages/shared/src/sse';
export type Conversation = { id:string; title:string; favorite:boolean; updated_at:string };
export type RuntimeEvent = { event_id:string; event_seq:number; event_type:string; response_message_id:string; payload:Record<string,any>; occurred_at:string };
export type ChatMessage = { id:string; role:"user"|"assistant"; content:string; status:string; model_id?:string; feedback?:string; events:RuntimeEvent[]; files?:ChatFile[]; redacted?:boolean };
export type ChatFile = { id:string; name:string; content_type?:string; size_bytes?:number };
export type ChatModel = { id:string; name:string; thinking_mode:string; thinking_default:boolean };
export type Action = { id:string; label:string; status:string; tool:string; args:Record<string,any>; before:unknown; preview:unknown; result?:unknown; error?:string; secure_result_available?:boolean; expires_at:string };

export const readEvents=readExecutionEvents;
export async function streamMessage(path:string,body:unknown,signal:AbortSignal,onEvent:(event:RuntimeEvent)=>void){
 const headers=new Headers({"content-type":"application/json"});const t=token();if(t)headers.set("authorization",`Bearer ${t}`);
 const response=await fetch(`${apiBase()}/api${path}`,{method:"POST",headers,body:JSON.stringify(body),signal});
 await readEvents(response,onEvent);
}
export async function chatFileBlob(id:string){
 const headers=new Headers(),t=token();if(t)headers.set('authorization',`Bearer ${t}`);
 const response=await fetch(`${apiBase()}/api/files/${encodeURIComponent(id)}/download`,{headers});if(!response.ok)throw Error('文件不可用或已无权限');return response.blob();
}
export async function downloadChatFile(id:string,name:string){
 const url=URL.createObjectURL(await chatFileBlob(id)),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
