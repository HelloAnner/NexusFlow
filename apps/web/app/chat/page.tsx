"use client";
import { useEffect,useLayoutEffect,useRef,useState } from "react";
import { ArrowUp,Bookmark,ChevronDown,FileText,History,LoaderCircle,Paperclip,Pencil,Plus,Search,Share2,Square,Trash2,X } from "lucide-react";
import { api } from "@/lib/api";
import { copyToClipboard } from '@/lib/clipboard';
import { BrandIcon } from "@/components/brand-icon";
import { type ChatFile } from "@/lib/assistant";
import { useAssistant } from "./use-assistant";
import { FileButton,Message } from "./components";
import "./chat.css";
export default function AssistantPage(){
 const chat=useAssistant(),[input,setInput]=useState(""),[panel,setPanel]=useState(""),[query,setQuery]=useState(""),[attachments,setAttachments]=useState<ChatFile[]>([]),[uploading,setUploading]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null),inputRef=useRef<HTMLTextAreaElement>(null),bottom=useRef<HTMLDivElement>(null),scroll=useRef<HTMLDivElement>(null),follow=useRef(true);
 useLayoutEffect(()=>{const field=inputRef.current;if(field){field.style.height='auto';field.style.height=`${field.scrollHeight}px`;}},[input]);
 const current=chat.conversations.find(c=>c.id===chat.id),selected=chat.models.find(m=>m.id===chat.model);
 useEffect(()=>{if(follow.current)bottom.current?.scrollIntoView({behavior:"instant"});},[chat.messages]);
 useEffect(()=>setAttachments([]),[chat.id]);
 const send=async(value=input)=>{if(uploading||chat.busy||!value.trim())return;const original=value;setInput("");follow.current=true;const ok=await chat.send(original,attachments);if(ok)setAttachments([]);else setInput(original);};
 const upload=async(files:File[])=>{setUploading(true);try{const accepted:ChatFile[]=[];for(const f of files){const form=new FormData();form.set("file",f);form.set("category","personal-report");form.set("scope","personal");accepted.push(await api<ChatFile>("/files/upload",{method:"POST",body:form}));}setAttachments(previous=>[...previous,...accepted]);}catch(e){chat.setError((e as Error).message);}finally{setUploading(false);}};
 const share=async()=>{if(!chat.id)return;try{const result=await api<{id:string}>(`/ai/conversations/${chat.id}/share`,{method:"POST",body:"{}"});const url=new URL(window.location.href);url.search="";url.searchParams.set("share",result.id);if(!await copyToClipboard(url.toString()))throw Error('复制失败');chat.setError("分享链接已复制；接收人须登录且拥有来源权限");}catch(e){chat.setError((e as Error).message);}};
 return <div className="ai-workspace">
  <header className="ai-header"><h1>{current?.title||"AI 助手"}</h1><div className="ai-actions">
   <button aria-expanded={panel==="history"} onClick={()=>setPanel(panel==="history"?"":"history")}><History size={16}/><span>历史</span></button>
   <button disabled={!chat.id} aria-expanded={panel==="files"} onClick={()=>{setPanel(panel==="files"?"":"files");void chat.loadFiles().catch(e=>chat.setError(e.message));}}><FileText size={16}/><span>文件</span></button>
   <button aria-label="分享对话" disabled={!chat.id||chat.busy} onClick={()=>void share()}><Share2 size={16}/></button>
   <button onClick={()=>void chat.select(null)}><Plus size={16}/><span>新对话</span></button>
  </div></header>
  <div className="ai-scroll" ref={scroll} onScroll={()=>{const e=scroll.current;if(e)follow.current=e.scrollHeight-e.scrollTop-e.clientHeight<100;}}>
   <div className="ai-content" aria-busy={chat.loading}>
    {chat.loading?<p className="ai-muted" role="status">正在读取会话…</p>:chat.messages.length?chat.messages.map((m,index)=><Message key={m.id} message={m} busy={chat.busy} onError={chat.setError} onFeedback={rating=>void chat.feedback(m,rating).catch(e=>chat.setError(e.message))} onRetry={()=>{const parent=[...chat.messages.slice(0,index)].reverse().find(p=>p.role==="user");if(parent)void chat.send(parent.content,parent.files||[],m);}}/>):<section className="ai-welcome"><div className="ai-welcome-mark"><BrandIcon size={56} hero decorative/></div><h2>有什么需要协调？</h2><div className="ai-suggestions">{["检查我未来两周的任务和风险","看看我负责的项目进展","检查人员负载和排期冲突"].map(q=><button key={q} onClick={()=>setInput(q)}>{q}<ArrowUp size={14}/></button>)}</div></section>}
    <div ref={bottom}/>
   </div>
  </div>
  <div className="ai-composer-wrap">
   {chat.error&&<div className="ai-notice" role="alert"><span>{chat.error}</span><button aria-label="关闭提示" onClick={()=>chat.setError("")}><X size={14}/></button></div>}
   <form className="ai-composer" onSubmit={e=>{e.preventDefault();void send();}}>
    {attachments.length>0&&<div className="ai-attachments">{attachments.map(f=><span key={f.id}><FileText size={13}/><span className="ai-attachment-name" title={f.name}>{f.name}</span><button type="button" aria-label={`移除 ${f.name}`} onClick={()=>setAttachments(prev=>prev.filter(a=>a.id!==f.id))}><X size={13}/></button></span>)}</div>}
    <div className="ai-composer-input-row"><textarea ref={inputRef} rows={1} aria-label="对话内容" value={input} placeholder="安排工作，或检查项目、排期与风险…" disabled={chat.loading} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}} onPaste={e=>{const files=Array.from(e.clipboardData.files);if(files.length){e.preventDefault();void upload(files);}}}/></div>
    <div className="ai-composer-tools"><div className="ai-actions">
     <input ref={fileInput} type="file" multiple hidden onChange={e=>{void upload(Array.from(e.target.files||[]));e.target.value="";}}/>
     <button className="ai-attach" type="button" aria-label="上传附件" title="上传附件" disabled={uploading||chat.busy} onClick={()=>fileInput.current?.click()}>{uploading?<LoaderCircle size={16} className="animate-spin"/>:<Paperclip size={16}/>}</button>
     <label className="ai-select"><select aria-label="选择对话模型" value={chat.model} disabled={chat.busy||!chat.models.length} onChange={e=>{chat.setModel(e.target.value);chat.setThinking("auto");}}>{!chat.models.length&&<option value="">模型未配置</option>}{chat.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><ChevronDown size={12} aria-hidden="true"/></label>
     <label className="ai-select"><select aria-label="思考模式" value={chat.thinking} disabled={chat.busy} onChange={e=>chat.setThinking(e.target.value)}><option value="auto">自动思考</option><option value="deep" disabled={selected?.thinking_mode==="unsupported"}>深度思考</option><option value="fast" disabled={selected?.thinking_mode==="always_on"}>快速</option></select><ChevronDown size={12} aria-hidden="true"/></label>
    </div>{chat.busy?<button className="ai-send" type="button" aria-label="停止处理" title="停止处理" onClick={()=>void chat.stop()}><Square size={13} fill="currentColor"/></button>:<button className="ai-send" type="submit" aria-label="发送消息" title="发送消息" disabled={!input.trim()||!chat.model||uploading}><ArrowUp size={18}/></button>}</div>
   </form>
  </div>
  {panel&&<div className="ai-backdrop" onClick={()=>setPanel("")}><aside className="ai-drawer" role="dialog" aria-modal="true" aria-label={panel==="history"?"会话历史":"会话文件"} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Escape")setPanel("");}}>
   <div className="ai-drawer-head"><strong>{panel==="history"?"会话历史":"会话文件"}</strong><button autoFocus aria-label="关闭面板" onClick={()=>setPanel("")}><X size={17}/></button></div>
   {panel==="history"?<><label className="ai-search"><Search size={15}/><input aria-label="搜索历史会话" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索会话"/></label>{chat.conversations.filter(c=>c.title.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(b.favorite)-Number(a.favorite)).map(c=><div className={`ai-history ${chat.id===c.id?"active":""}`} key={c.id}><button className="ai-history-title" onClick={()=>{void chat.select(c.id);setPanel("");}}>{c.favorite&&<Bookmark size={12}/>}<span>{c.title}</span></button><button aria-label="收藏会话" aria-pressed={c.favorite} onClick={()=>void chat.update(c,{favorite:!c.favorite}).catch(e=>chat.setError(e.message))}><Bookmark size={13}/></button><button aria-label="重命名会话" onClick={()=>{const title=window.prompt("会话名称",c.title);if(title)void chat.update(c,{title}).catch(e=>chat.setError(e.message));}}><Pencil size={13}/></button><button aria-label="删除会话" onClick={()=>{if(window.confirm("删除对话记录？已经执行的业务操作不会撤销。"))void chat.remove(c).catch(e=>chat.setError(e.message));}}><Trash2 size={13}/></button></div>)}</>:chat.files.length?chat.files.map(f=><FileButton key={f.id} file={f} onError={chat.setError}/>):<p className="ai-muted">暂无文件</p>}
  </aside></div>}
 </div>;
}
