"use client";
import { useEffect,useState } from "react";
import { Check,ChevronDown,Copy,FileText,LoaderCircle,RefreshCw,ThumbsDown,ThumbsUp,X } from "lucide-react";
import { Streamdown } from "streamdown";
import { api } from "@/lib/api";
import { copyToClipboard } from '@/lib/clipboard';
import { downloadChatFile,chatFileBlob,type Action,type ChatFile,type ChatMessage,type RuntimeEvent } from "@/lib/assistant";
const json=(v:unknown)=>JSON.stringify(v,null,2);
export function FileButton({file,onError}:{file:ChatFile;onError:(error:string)=>void}){
 const [preview,setPreview]=useState<{url?:string;text?:string}|null>(null),[loading,setLoading]=useState(false);
 useEffect(()=>()=>{if(preview?.url)URL.revokeObjectURL(preview.url);},[preview]);
 const open=async()=>{setLoading(true);try{if(/^(image\/(png|jpeg)|application\/pdf)$/.test(file.content_type||''))setPreview({url:URL.createObjectURL(await chatFileBlob(file.id))});else{const value=await api<{context:string}>(`/planning/files/${file.id}/text`);setPreview({text:value.context});}}catch(e){onError((e as Error).message);}finally{setLoading(false);}};
 return <><div className="ai-file"><button type="button" disabled={loading} onClick={()=>void open()}><FileText size={15}/><span>{file.name}</span></button><button type="button" aria-label={`下载 ${file.name}`} onClick={()=>void downloadChatFile(file.id,file.name).catch(e=>onError(e.message))}>下载</button></div>{preview&&<div className="ai-preview" role="dialog" aria-modal="true" aria-label={file.name}><div className="ai-drawer-head"><strong>{file.name}</strong><button autoFocus aria-label="关闭预览" onClick={()=>setPreview(null)}><X size={18}/></button></div>{preview.url?file.content_type?.startsWith('image/')?<img src={preview.url} alt={file.name}/>:<iframe title={file.name} src={preview.url} sandbox=""/>:<pre>{preview.text}</pre>}</div>}</>;
}
export function ActionCard({initial,onError}:{initial:Action;onError:(error:string)=>void}){
 const [action,setAction]=useState(initial),[busy,setBusy]=useState(false);
 useEffect(()=>setAction(initial),[initial]);
 const decide=async(decision:string)=>{setBusy(true);try{setAction(await api<Action>(`/ai/actions/${action.id}/${decision}`,{method:"POST",body:"{}"}));}catch(e){onError((e as Error).message);try{setAction(await api<Action>(`/ai/actions/${action.id}`));}catch{ /* 原错误保留，不能伪造操作结果。 */ }}finally{setBusy(false);}};
 const pending=action.status==="pending",expired=Date.parse(action.expires_at)<Date.now();
 return <section className="ai-action" aria-label="操作确认"><strong>{action.label}</strong><p className="ai-muted">{({pending:"等待确认",executing:"执行中，请查询结果，不要重复提交",succeeded:"已执行并回读",failed:"执行失败",uncertain:"执行结果待核对，请勿重试",cancelled:"已取消",expired:"预览已过期"} as Record<string,string>)[action.status]||action.status}</p>
  <details><summary>变更内容</summary><pre>{json(action.args)}</pre></details>
  {action.before!=null&&<details><summary>变更前</summary><pre>{json(action.before)}</pre></details>}
  {action.preview!=null&&<details open><summary>影响检查</summary><pre>{json(action.preview)}</pre></details>}
  {action.result!=null&&<details><summary>执行与回读结果</summary><pre>{json(action.result)}</pre></details>}
  {action.error&&<p role="alert" className="ai-error">{action.error}</p>}
  {action.status==='succeeded'&&action.secure_result_available&&<button onClick={()=>void api<{invitation_token:string}>(`/ai/actions/${action.id}/secure-result`).then(async result=>{if(!await copyToClipboard(result.invitation_token))throw Error('复制失败');onError('邀请凭据已复制，不会进入模型或对话记录');}).catch(e=>onError(e.message))}>复制邀请凭据</button>}
  {pending&&<div className="ai-actions"><button className="ai-primary" disabled={busy||expired} onClick={()=>void decide("confirm")}>{busy?<LoaderCircle size={14} className="animate-spin"/>:<Check size={14}/>}确认执行</button><button disabled={busy} onClick={()=>void decide("cancel")}><X size={14}/>取消</button><span className="ai-muted">{expired?"预览已过期，请重新提出操作":"确认时重新检查权限和数据版本"}</span></div>}
 </section>;
}
function tools(events:RuntimeEvent[]){const calls=new Map<string,{label:string;status:string;args:unknown;result?:unknown;ms?:number}>();for(const e of events){if(!e.event_type.startsWith("tool."))continue;const p=e.payload,k=String(p.tool_call_id);calls.set(k,{...calls.get(k),label:String(p.label||p.name),status:e.event_type.split(".")[1],args:p.arguments??calls.get(k)?.args,result:p.result??p.error,ms:p.duration_ms});}return [...calls.entries()];}
export function Message({message,busy,onRetry,onFeedback,onError}:{message:ChatMessage;busy:boolean;onRetry:()=>void;onFeedback:(rating:string)=>void;onError:(error:string)=>void}){
 const calls=tools(message.events||[]),actions=(message.events||[]).filter(e=>e.event_type==="action.proposed").map(e=>e.payload.action as Action);
 const running=message.status==="answering",[copied,setCopied]=useState(false),[open,setOpen]=useState(running),[batch,setBatch]=useState<Action[]>([]),[confirming,setConfirming]=useState(false);
 const shownActions=actions.map(a=>batch.find(b=>b.id===a.id)||a),pending=shownActions.filter(a=>a.status==='pending');
 const confirmAll=async()=>{const session=message.events.find(e=>e.event_type==='execution.started') as any;if(!session?.session_id){onError('请刷新会话后再确认');return;}setConfirming(true);try{const result=await api<{results:Action[];stopped:boolean;error?:string}>(`/ai/conversations/${session.session_id}/messages/${message.id}/confirm-actions`,{method:'POST',body:JSON.stringify({action_ids:pending.map(a=>a.id)})});setBatch(result.results);if(result.stopped)onError(result.error||'部分操作未执行，请逐项查看结果');}catch(e){onError((e as Error).message);}finally{setConfirming(false);}};
 useEffect(()=>{if(!running)setOpen(false);},[running]);
 return <article className={`ai-message ai-${message.role}`}>
  {message.role==="assistant"&&<div className="ai-identity">NexusFlow <span className="ai-muted">{message.model_id||"项目协同助手"}</span></div>}
  {message.role==="assistant"&&calls.length>0&&<section className="ai-trace"><button className="ai-trace-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>{running?<LoaderCircle size={14} className="animate-spin"/>:<Check size={14}/>} {running?"正在处理":"执行过程"} · {calls.length} 个步骤 <ChevronDown size={14}/></button>{open&&<ol>{calls.map(([key,t])=><li key={key}><span>{t.status==="started"?"正在":t.status==="failed"?"失败：":"已完成："}{t.label}</span>{t.ms!=null&&<small>{(t.ms/1000).toFixed(1)}s</small>}<details><summary>详情</summary><pre>{json({参数:t.args,结果:t.result})}</pre></details></li>)}</ol>}</section>}
  {message.content?<div className="ai-markdown"><Streamdown isAnimating={running} animated={false}>{message.content}</Streamdown></div>:running?<p className="ai-muted" role="status">正在处理…</p>:null}
  {(message.files||[]).map(f=><FileButton key={f.id} file={f} onError={onError}/>)}
  {pending.length>1&&<button className="ai-primary" disabled={confirming||busy} onClick={()=>void confirmAll()}>{confirming?'正在执行…':`确认本轮 ${pending.length} 项操作`}</button>}
  {shownActions.map(a=><ActionCard key={a.id} initial={a} onError={onError}/>)}
  {message.redacted&&<p className="ai-muted">权限已变化，历史业务内容已隐藏。</p>}
  {message.role==="assistant"&&!running&&<div className="ai-message-actions">
   <button aria-label="复制回答" onClick={()=>void copyToClipboard(message.content).then(ok=>{if(!ok)throw Error('复制失败');setCopied(true);setTimeout(()=>setCopied(false),1500);}).catch(()=>onError("复制失败"))}>{copied?<Check size={14}/>:<Copy size={14}/>}</button>
   <button aria-label="有帮助" aria-pressed={message.feedback==="up"} onClick={()=>onFeedback(message.feedback==="up"?"":"up")}><ThumbsUp size={14}/></button>
   <button aria-label="无帮助" aria-pressed={message.feedback==="down"} onClick={()=>onFeedback(message.feedback==="down"?"":"down")}><ThumbsDown size={14}/></button>
   {["failed","cancelled"].includes(message.status)&&<button disabled={busy||message.redacted} onClick={onRetry}><RefreshCw size={14}/>重试</button>}
   {message.status!=="completed"&&<span className="ai-muted">{message.status==="cancelled"?"已停止":message.status==="failed"?"执行失败":message.status}</span>}
  </div>}
 </article>;
}
