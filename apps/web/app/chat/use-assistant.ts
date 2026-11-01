"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { api,sessionEpoch,subscribeSession } from "@/lib/api";
import { newId } from '@/lib/utils';
import { streamMessage,type Conversation,type ChatMessage,type ChatFile,type ChatModel,type RuntimeEvent } from "@/lib/assistant";

export function useAssistant(){
 const [conversations,setConversations]=useState<Conversation[]>([]),[id,setId]=useState<string|null>(null),[messages,setMessages]=useState<ChatMessage[]>([]);
 const [models,setModels]=useState<ChatModel[]>([]),[model,setModel]=useState(""),[thinking,setThinking]=useState("auto");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[files,setFiles]=useState<ChatFile[]>([]);
 const controller=useRef<AbortController|null>(null),generation=useRef(0),activeId=useRef<string|null>(null),assistantId=useRef<string|null>(null),locked=useRef(false);
 const refresh=useCallback(async()=>{const value=await api<{items:Conversation[]}>("/ai/conversations");setConversations(value.items);},[]);
 useEffect(()=>{let live=true;Promise.all([api<{models:ChatModel[];default_model_id:string}>("/ai/models"),refresh()]).then(([catalog])=>{if(live){setModels(catalog.models);setModel(catalog.default_model_id);}}).catch(e=>live&&setError(e.message));
 const unsubscribe=subscribeSession(()=>{controller.current?.abort();generation.current++;activeId.current=null;locked.current=false;setBusy(false);setId(null);setMessages([]);setFiles([]);setConversations([]);});
 return()=>{live=false;unsubscribe();controller.current?.abort();generation.current++;};},[refresh]);
 const select=useCallback(async(next:string|null)=>{
  if(controller.current){controller.current.abort();if(activeId.current&&assistantId.current)void api(`/ai/conversations/${activeId.current}/messages/${assistantId.current}/cancel`,{method:"POST",body:"{}"}).catch(()=>{});}
  generation.current++;locked.current=false;controller.current=null;activeId.current=next;assistantId.current=null;setBusy(false);setId(next);setMessages([]);setFiles([]);setError("");setLoading(Boolean(next));
  window.history.replaceState(null,"",next?`?c=${encodeURIComponent(next)}`:window.location.pathname);
  if(!next)return;const g=generation.current;
  try{const value=await api<{messages:ChatMessage[]}>(`/ai/conversations/${next}/messages`);if(g===generation.current)setMessages(value.messages);}
  catch(e){if(g===generation.current)setError((e as Error).message);}finally{if(g===generation.current)setLoading(false);}
 },[]);
 useEffect(()=>{const query=new URLSearchParams(window.location.search),c=query.get("c"),share=query.get("share");if(share){api<{messages:ChatMessage[]}>(`/ai/shares/${encodeURIComponent(share)}`).then(v=>setMessages(v.messages)).catch(e=>setError(e.message));}else if(c)void select(c);},[select]);
 const send=async(content:string,attachments:ChatFile[]=[],retry?:ChatMessage)=>{
  if(locked.current||!model||!content.trim())return false;locked.current=true;setBusy(true);setError("");const g=++generation.current,epoch=sessionEpoch(),abort=new AbortController();controller.current=abort;
  let conversationId=id;
  try{
   if(!conversationId){const created=await api<Conversation>("/ai/conversations",{method:"POST",body:JSON.stringify({title:content.slice(0,40)})});if(g!==generation.current)return false;conversationId=created.id;setId(created.id);window.history.replaceState(null,"",`?c=${created.id}`);}
   activeId.current=conversationId;const temp=newId();assistantId.current=temp;
   setMessages(previous=>[...previous,...(retry?[]:[{id:newId(),role:"user" as const,content,status:"completed",events:[],files:attachments}]),{id:temp,role:"assistant",content:"",status:"answering",events:[]}]);
   const selected=models.find(m=>m.id===model),enabled=thinking==="auto"?selected?.thinking_default:thinking==="deep";
   let terminal=false;
   const event=(e:RuntimeEvent)=>{
    if(g!==generation.current||epoch!==sessionEpoch())return;
    if(e.event_type==="execution.started")assistantId.current=e.response_message_id;
    if(["execution.completed","execution.failed","execution.cancelled"].includes(e.event_type))terminal=true;
    if(e.event_type==="execution.failed")setError(e.payload.error||"执行失败");
    setMessages(previous=>previous.map(m=>m.id===temp||m.id===e.response_message_id?{...m,id:e.response_message_id,events:[...m.events,e],...(e.event_type==="response.delta"?{content:m.content+String(e.payload.delta||"")}:{ }),...(e.event_type==="response.reset"?{content:""}:{}),...(e.event_type==="execution.completed"?{content:String(e.payload.content||m.content),status:"completed",model_id:e.payload.model_id}:{}),...(e.event_type==="execution.failed"?{status:"failed"}:{}),...(e.event_type==="execution.cancelled"?{status:"cancelled"}:{})}:m));
   };
   const path=retry?`/ai/conversations/${conversationId}/messages/${retry.id}/retry`:`/ai/conversations/${conversationId}/messages`;
   await streamMessage(path,{content,client_request_id:newId(),file_ids:attachments.map(f=>f.id),model_id:model,thinking_enabled:enabled},abort.signal,event);
   if(!terminal&&!abort.signal.aborted)throw Error("连接已断开，请刷新历史核对执行结果，勿重复提交操作");
   if(g===generation.current){await refresh();const value=await api<{messages:ChatMessage[]}>(`/ai/conversations/${conversationId}/messages`);if(g===generation.current)setMessages(value.messages);}
   return true;
  }catch(e){if(g===generation.current){setError(abort.signal.aborted?"已停止；已提交的操作不会自动撤销":(e as Error).message);setMessages(prev=>prev.map(m=>m.id===assistantId.current?{...m,status:abort.signal.aborted?"cancelled":"failed"}:m));}return false;}
  finally{if(g===generation.current){locked.current=false;setBusy(false);controller.current=null;}}
 };
 const stop=async()=>{controller.current?.abort();if(id&&assistantId.current){try{await api(`/ai/conversations/${id}/messages/${assistantId.current}/cancel`,{method:"POST",body:"{}"});}catch(e){setError((e as Error).message);}}};
 const update=async(conversation:Conversation,patch:Record<string,unknown>)=>{await api(`/ai/conversations/${conversation.id}`,{method:"PATCH",body:JSON.stringify(patch)});await refresh();};
 const remove=async(conversation:Conversation)=>{await api(`/ai/conversations/${conversation.id}`,{method:"DELETE"});if(id===conversation.id)await select(null);await refresh();};
 const loadFiles=async()=>{if(!id)return;const data=await api<{items:ChatFile[]}>(`/ai/conversations/${id}/files`);setFiles(data.items);};
 const feedback=async(message:ChatMessage,value:string)=>{if(!id)return;await api(`/ai/conversations/${id}/messages/${message.id}/feedback`,{method:"PUT",body:JSON.stringify({rating:value})});setMessages(prev=>prev.map(m=>m.id===message.id?{...m,feedback:value}:m));};
 return {conversations,id,messages,models,model,setModel,thinking,setThinking,error,setError,busy,loading,files,loadFiles,select,send,stop,update,remove,feedback};
}
