import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CliArgs } from './args';
import { option } from './args';
import type { Client } from './client';
import { readExecutionEvents,type ExecutionEvent } from '../../packages/shared/src/sse';
async function savedConversation(client:Client,next?:string){
 const user=await client.json('/api/auth/me'),key=`${client.base}:${user.tenant_id}:${user.id}`,dir=join(homedir(),'.config','nexusflow'),path=join(dir,'ai-conversations.json');let saved:Record<string,string>={};
 try{saved=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(next){await mkdir(dir,{recursive:true,mode:0o700});saved[key]=next;await writeFile(path,JSON.stringify(saved),{mode:0o600});return next;}return saved[key];
}
export async function chatCommand(client:Client,args:CliArgs){
 const content=[...(args.action==='list'?[]:[args.action]),...args.positionals].join(' ').trim();if(!content)throw Error('chat requires a question');
 let cid=option(args,'conversation')||((args.options.continue===true)?await savedConversation(client):undefined);
 if(!cid){if(args.options.continue===true)throw Error('no conversation for this identity; send without --continue first');cid=(await client.json('/api/ai/conversations','POST',{title:content.slice(0,80)})).id;}
 await savedConversation(client,cid);const controller=new AbortController(),events:ExecutionEvent[]=[];let messageId='',terminal=false;
 const stop=()=>{controller.abort();if(messageId)void client.json(`/api/ai/conversations/${cid}/messages/${messageId}/cancel`,'POST',{}).catch(()=>{});};process.once('SIGINT',stop);
 try{
  const thinking=option(args,'thinking','auto');if(!['auto','on','off'].includes(thinking))throw Error('--thinking auto|on|off required');
  const model=option(args,'model'),retry=option(args,'retry'),path=retry?`/api/ai/conversations/${cid}/messages/${encodeURIComponent(retry)}/retry`:`/api/ai/conversations/${cid}/messages`;
  const response=await fetch(client.base+path,{method:'POST',headers:{authorization:`Bearer ${client.token}`,'content-type':'application/json'},body:JSON.stringify({content,client_request_id:option(args,'request-id',crypto.randomUUID()),file_ids:option(args,'file-ids').split(',').filter(Boolean),...(model?{model_id:model}:{}),...(thinking==='auto'?{}:{thinking_enabled:thinking==='on'})}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
  await readExecutionEvents(response,e=>{events.push(e);messageId=e.response_message_id;if(['execution.completed','execution.failed','execution.cancelled'].includes(e.event_type))terminal=true;});
  if(!terminal)throw Error('SSE disconnected without completion; read conversation before retrying');
  const trace=await client.json(`/api/ai/conversations/${cid}/messages/${messageId}/trace`);
  if(trace.status!=='completed')throw Error(`对话${trace.status}: ${trace.error||'请查询轨迹'}`);
  return {conversation_id:cid,message_id:messageId,content:trace.content,events,trace};
 }finally{process.removeListener('SIGINT',stop);}
}
export async function aiCommand(client:Client,args:CliArgs){
 const p=args.positionals,action=args.action;
 if(action==='confirm-batch'){if(p.length!==2)throw Error('ai confirm-batch CONVERSATION MESSAGE');const trace=await client.json(`/api/ai/conversations/${encodeURIComponent(p[0]!)}/messages/${encodeURIComponent(p[1]!)}/trace`),ids=trace.events.filter((e:any)=>e.event_type==='action.proposed'&&e.payload.action.status==='pending').map((e:any)=>e.payload.action.id);if(!ids.length)throw Error('no pending actions');const result=await client.json(`/api/ai/conversations/${encodeURIComponent(p[0]!)}/messages/${encodeURIComponent(p[1]!)}/confirm-actions`,'POST',{action_ids:ids});if(result.stopped)throw Error(result.error||'batch stopped; read each action for committed results');return result;}
 if(action==='reveal'){if(!p[0])throw Error('ai reveal requires action id');return client.json(`/api/ai/actions/${encodeURIComponent(p[0])}/secure-result`);}
 if(action==='models')return client.json('/api/ai/models');
 if(action==='capabilities')return client.json('/api/ai/capabilities');
 if(action==='action'){if(!p[0])throw Error('ai action requires action id');return client.json(`/api/ai/actions/${encodeURIComponent(p[0])}`);}
 if(['confirm','cancel'].includes(action)){if(!p[0])throw Error(`ai ${action} requires action id`);const result=await client.json(`/api/ai/actions/${encodeURIComponent(p[0])}/${action}`,'POST',{});if(action==='confirm'&&result.status!=='succeeded')throw Error(`operation ${result.status}: ${result.error||'read action before retrying'}`);return result;}
 if(action==='trace'){if(p.length!==2)throw Error('ai trace CONVERSATION_ID MESSAGE_ID');return client.json(`/api/ai/conversations/${encodeURIComponent(p[0]!)}/messages/${encodeURIComponent(p[1]!)}/trace`);}
 if(action==='tool'){if(!p[0]||!p[1])throw Error('ai tool TOOL_NAME JSON_ARGS');let parsed;try{parsed=JSON.parse(p.slice(1).join(' '));}catch{throw Error('invalid tool JSON');}return client.json(`/api/ai/tools/${encodeURIComponent(p[0])}`,'POST',{args:parsed,client_request_id:option(args,'request-id',crypto.randomUUID()),query:option(args,'intent','CLI 工具操作'),...(option(args,'conversation')?{conversation_id:option(args,'conversation')}:{})});}
 if(action==='share'){if(!p[0])throw Error('ai share requires conversation id');return client.json(`/api/ai/conversations/${encodeURIComponent(p[0])}/share`,'POST',{});}
 if(action==='shared'){if(!p[0])throw Error('ai shared requires share id');return client.json(`/api/ai/shares/${encodeURIComponent(p[0])}`);}
 throw Error('ai actions: models capabilities tool action confirm confirm-batch cancel trace share shared reveal');
}
export async function conversationsCommand(client:Client,args:CliArgs){
 const id=args.positionals[0],path='/api/ai/conversations';
 if(args.action==='list')return client.json(path);
 if(args.action==='create')return client.json(path,'POST',{title:args.positionals.join(' ')||'CLI 会话'});
 if(!id)throw Error('conversation id required');const target=`${path}/${encodeURIComponent(id)}`;
 if(args.action==='show')return client.json(target+'/messages');
 if(args.action==='files')return client.json(target+'/files');
 if(args.action==='delete')return client.json(target,'DELETE');
 if(args.action==='rename')return client.json(target,'PATCH',{title:args.positionals.slice(1).join(' ')});
 if(args.action==='favorite')return client.json(target,'PATCH',{favorite:option(args,'enabled','true')==='true'});
 if(args.action==='stop'){if(!args.positionals[1])throw Error('message id required');return client.json(`${target}/messages/${encodeURIComponent(args.positionals[1])}/cancel`,'POST',{});}
 if(args.action==='feedback'){if(!args.positionals[1])throw Error('message id required');return client.json(`${target}/messages/${encodeURIComponent(args.positionals[1])}/feedback`,'PUT',{rating:option(args,'rating')});}
 throw Error('conversations actions: list create show files delete rename favorite stop feedback');
}
export async function verifyAssistant(client:Client){
 const capabilities=await client.json('/api/ai/capabilities'),catalog=await client.json('/api/ai/models');
 if(!catalog.configured||!catalog.models.length)throw Error('assistant model is not configured');
 if(!capabilities.items.some((t:any)=>t.name==='my_work'))throw Error('personal work tool missing');
 const names=capabilities.items.map((t:any)=>t.name);if(new Set(names).size!==names.length)throw Error('duplicate tool registration');
 const report=await chatCommand(client,{command:'chat',action:'检查我未来两周的任务和风险，不要执行任何修改',positionals:[],options:{json:true}});
 if(!report.events.some(e=>e.event_type==='tool.completed'))throw Error('real conversation did not execute business tools');
 return {passed:true,business_writes:false,capability_count:names.length,report};
}
