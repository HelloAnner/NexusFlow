import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { Context } from 'hono';
import type { ApiApp,ApiEnv } from '../../shared/http.ts';
import { actor } from '../../permissions.ts';
import { modelCatalog,resolveModel } from './models.ts';
import { db,owned,getMessages,createPair,finish,getAction } from './repository.ts';
import { internalHeaders,sanitize,permissionStamp,referencesAllowed,hasAggregate,type Runtime } from './transport.ts';
import { toolSpecs,toolAvailable } from './catalog.ts';
import { activeRuns,runKernel,invokeTool } from './kernel.ts';
import { confirm } from './operations.ts';
import { visibleAction } from './action-access.ts';
import { unseal } from './secrets.ts';
import { prepareFiles } from '../planning/files.ts';
const sendBody=z.object({content:z.string().trim().min(1).max(20000),client_request_id:z.string().min(1).max(128),file_ids:z.array(z.string().max(128)).max(10).default([]),model_id:z.string().optional(),thinking_enabled:z.boolean().optional()}).strict();
function runtime(app:ApiApp,c:Context<ApiEnv>,conversationId='',messageId='',signal:AbortSignal=new AbortController().signal):Runtime {
 const headers=internalHeaders(c.req.raw.headers);headers.set('x-request-id',c.get('request_id'));
 return {app,headers,user:actor(c),conversationId,messageId,query:'',signal,refs:new Set(),emit:async()=>{}};
}
export function registerAssistant(app:ApiApp){
 app.use('/api/ai/*',async(c,next)=>{c.header('cache-control','private, no-store');if(c.req.method!=='GET'){const origin=c.req.header('origin');if(origin&&origin!==new URL(c.req.url).origin)return c.json({error:'forbidden origin'},403);}await next();});
 app.get('/api/ai/models',c=>c.json(modelCatalog()));
 app.get('/api/ai/capabilities',c=>c.json({items:toolSpecs.filter(s=>toolAvailable(actor(c),s)),excluded:['生产 SQL','Shell','密钥','生产 seed','部署和数据库迁移']}));
 app.get('/api/ai/conversations',async c=>{const u=actor(c);return c.json({items:await db()`SELECT id,title,favorite,updated_at FROM nexusflow.ai_conversations WHERE tenant_id=${u.tenant_id!} AND user_id=${u.id} AND status='active' ORDER BY favorite DESC,updated_at DESC LIMIT 500`});});
 app.post('/api/ai/conversations',async c=>{const input=z.object({title:z.string().trim().min(1).max(200).default('新对话')}).strict().parse(await c.req.json()),u=actor(c),id=crypto.randomUUID();const rows=await db()`INSERT INTO nexusflow.ai_conversations(id,tenant_id,user_id,title) VALUES(${id},${u.tenant_id!},${u.id},${input.title}) RETURNING id,title,favorite,updated_at`;return c.json(rows[0],201);});
 app.patch('/api/ai/conversations/:id',async c=>{const u=actor(c),id=c.req.param('id');await owned(u,id);const input=z.object({title:z.string().trim().min(1).max(200).optional(),favorite:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0).parse(await c.req.json());await db()`UPDATE nexusflow.ai_conversations SET title=coalesce(${input.title??null},title),favorite=coalesce(${input.favorite??null},favorite),updated_at=now() WHERE id=${id}`;return c.json(await owned(u,id));});
 app.delete('/api/ai/conversations/:id',async c=>{const u=actor(c),id=c.req.param('id');await owned(u,id);const active=await db()`SELECT id FROM nexusflow.ai_messages WHERE conversation_id=${id} AND status='answering'`;for(const m of active)activeRuns.get(String(m.id))?.abort();await db().begin(async tx=>{await tx`UPDATE nexusflow.ai_conversations SET status='deleted',updated_at=now() WHERE id=${id}`;await tx`UPDATE nexusflow.ai_actions SET status='cancelled' WHERE conversation_id=${id} AND status='pending'`;});return c.json({ok:true});});
 app.get('/api/ai/conversations/:id/messages',async c=>{const rt=runtime(app,c,c.req.param('id'));const messages=await hydratedMessages(rt);return c.json({messages});});
 app.get('/api/ai/conversations/:id/files',async c=>{const rt=runtime(app,c,c.req.param('id'));await owned(rt.user,rt.conversationId);const rows=await db()`SELECT data->'file_ids' ids FROM nexusflow.ai_messages WHERE conversation_id=${rt.conversationId} AND user_id=${rt.user.id} AND tenant_id=${rt.user.tenant_id!}`;const ids=[...new Set(rows.flatMap(r=>Array.isArray(r.ids)?r.ids.map(String):[]))];const files=await prepareFiles(rt.user,ids,false);return c.json({items:files.files});});
 app.post('/api/ai/conversations/:id/messages',c=>send(app,c));
 app.post('/api/ai/conversations/:id/messages/:messageId/retry',async c=>{
  const rt=runtime(app,c,c.req.param('id'));await owned(rt.user,rt.conversationId);
  const rows=await db()`SELECT * FROM nexusflow.ai_messages WHERE id=${c.req.param('messageId')} AND conversation_id=${rt.conversationId} AND user_id=${rt.user.id} AND tenant_id=${rt.user.tenant_id!}`;
  const failed=rows[0];if(!failed||!['failed','cancelled'].includes(failed.status))return c.json({error:'invalid retry message state'},409);
  const visible=await hydratedMessages(rt);if(visible.find(m=>m.id===failed.id)?.redacted)return c.json({error:'forbidden: historical scope changed'},403);
  const parent=await db()`SELECT * FROM nexusflow.ai_messages WHERE id=${failed.parent_id} AND user_id=${rt.user.id}`;if(!parent[0])return c.json({error:'parent not found'},404);
  const actions=await db()`SELECT id FROM nexusflow.ai_actions WHERE message_id=${failed.id} LIMIT 1`;
  if(actions.length)return c.json({error:'该回合已生成业务操作，请先查看操作状态；为避免重复写入，请新发一条消息继续'},409);
  return send(app,c,{content:String(parent[0].content),client_request_id:crypto.randomUUID(),file_ids:(parent[0].data as any).file_ids||[],model_id:(failed.data as any).model_id,thinking_enabled:(failed.data as any).thinking_enabled},String(failed.id));
 });
 app.post('/api/ai/conversations/:id/messages/:messageId/cancel',async c=>{const rt=runtime(app,c,c.req.param('id'));await owned(rt.user,rt.conversationId);const id=c.req.param('messageId'),rows=await db()`SELECT id,status FROM nexusflow.ai_messages WHERE id=${id} AND conversation_id=${rt.conversationId} AND user_id=${rt.user.id} AND tenant_id=${rt.user.tenant_id!}`;if(!rows[0])return c.json({error:'message not found'},404);const run=activeRuns.get(id);if(run?.userId===rt.user.id)run.abort();await db()`UPDATE nexusflow.ai_messages SET status='cancelled',updated_at=now() WHERE id=${id} AND status='answering'`;return c.json({id,status:rows[0].status==='answering'?'cancelled':rows[0].status});});
 app.put('/api/ai/conversations/:id/messages/:messageId/feedback',async c=>{const rt=runtime(app,c,c.req.param('id'));await owned(rt.user,rt.conversationId);const {rating}=z.object({rating:z.enum(['','up','down'])}).strict().parse(await c.req.json());const rows=await db()`UPDATE nexusflow.ai_messages SET data=data||${db().json({feedback:rating} as any)} WHERE id=${c.req.param('messageId')} AND conversation_id=${rt.conversationId} AND user_id=${rt.user.id} AND role='assistant' RETURNING id`;if(!rows.length)return c.json({error:'message not found'},404);return c.json({ok:true});});
 app.get('/api/ai/conversations/:id/messages/:messageId/trace',async c=>{const rt=runtime(app,c,c.req.param('id'));const messages=await hydratedMessages(rt),m=messages.find(m=>m.id===c.req.param('messageId'));return m?c.json(m):c.json({error:'message not found'},404);});
 app.post('/api/ai/conversations/:id/messages/:messageId/confirm-actions',async c=>{
  const rt=runtime(app,c,c.req.param('id'),c.req.param('messageId'));await owned(rt.user,rt.conversationId);
  const input=z.object({action_ids:z.array(z.string().max(128)).min(1).max(20)}).strict().parse(await c.req.json()),ids=[...new Set(input.action_ids)];
  const rows=await db()`SELECT id FROM nexusflow.ai_actions WHERE id = ANY(${ids}::text[]) AND message_id=${rt.messageId} AND conversation_id=${rt.conversationId} AND user_id=${rt.user.id} AND tenant_id=${rt.user.tenant_id!}`;
  if(rows.length!==ids.length)return c.json({error:'forbidden: batch action ownership mismatch'},403);
  // 真实用户确认明确的操作 ID 集合；不是给模型一个可伪造的 confirmed 参数。
  const results=[];for(const id of ids){try{const result=await confirm(rt,id,true);results.push(result);if(result.status!=='succeeded')return c.json({results,stopped:true});}catch(e){return c.json({results,stopped:true,error:(e as Error).message});}}
  return c.json({results,stopped:false});
 });
 app.get('/api/ai/actions/:id',async c=>c.json(await visibleAction(runtime(app,c),c.req.param('id'))));
 app.get('/api/ai/actions/:id/secure-result',async c=>{const rt=runtime(app,c),action=await visibleAction(rt,c.req.param('id'));if(action.status!=='succeeded')return c.json({error:'secure result not found'},404);const rows=await db()`SELECT data->>'encrypted_result' result FROM nexusflow.ai_actions WHERE id=${action.id} AND user_id=${rt.user.id} AND tenant_id=${rt.user.tenant_id!}`;return rows[0]?.result?c.json(unseal(String(rows[0].result))):c.json({error:'secure result not found'},404);});
 app.post('/api/ai/actions/:id/confirm',async c=>{const u=actor(c),id=c.req.param('id');await getAction(u,id);const rows=await db()`SELECT conversation_id,message_id FROM nexusflow.ai_actions WHERE id=${id} AND user_id=${u.id} AND tenant_id=${u.tenant_id!}`;const rt=runtime(app,c,String(rows[0].conversation_id),String(rows[0].message_id));return c.json(await confirm(rt,id));});
 app.post('/api/ai/actions/:id/cancel',async c=>{const u=actor(c),id=c.req.param('id');await visibleAction(runtime(app,c),id);await db()`UPDATE nexusflow.ai_actions SET status='cancelled',updated_at=now() WHERE id=${id} AND user_id=${u.id} AND tenant_id=${u.tenant_id!} AND status='pending'`;return c.json(await getAction(u,id));});
 app.post('/api/ai/tools/:name',async c=>{
  const input=z.object({args:z.record(z.unknown()),conversation_id:z.string().optional(),client_request_id:z.string().min(1).max(128),query:z.string().max(20000).default('CLI 工具操作')}).strict().parse(await c.req.json()),abort=new AbortController();
  let cid=input.conversation_id;if(!cid){cid=crypto.randomUUID();await db()`INSERT INTO nexusflow.ai_conversations(id,tenant_id,user_id,title) VALUES(${cid},${actor(c).tenant_id!},${actor(c).id},'CLI 工具操作')`;}
  const rt=runtime(app,c,cid,crypto.randomUUID(),abort.signal);rt.query=input.query;const events:any[]=[];rt.emit=async(type,payload)=>{events.push({event_type:type,payload:sanitize(payload)});};
  await createPair(rt,{content:input.query,client_request_id:input.client_request_id,file_ids:[]},{source:'cli_tool'});
  try{const result=await invokeTool(rt,c.req.param('name'),input.args);await finish(rt,'completed',JSON.stringify(result),{events});return c.json({conversation_id:cid,message_id:rt.messageId,result,events});}catch(e){await finish(rt,'failed','',{events,error:(e as Error).message});throw e;}
 });
 app.post('/api/ai/conversations/:id/share',async c=>{const u=actor(c),cid=c.req.param('id');await owned(u,cid);const id=crypto.randomUUID();await db()`INSERT INTO nexusflow.ai_shares(id,conversation_id,tenant_id,user_id,expires_at) VALUES(${id},${cid},${u.tenant_id!},${u.id},now()+interval '7 days')`;return c.json({id,expires_in_days:7},201);});
 app.get('/api/ai/shares/:id',async c=>{
  const u=actor(c),shares=await db()`SELECT s.*,c.status FROM nexusflow.ai_shares s JOIN nexusflow.ai_conversations c ON c.id=s.conversation_id WHERE s.id=${c.req.param('id')} AND s.tenant_id=${u.tenant_id!} AND s.expires_at>now() AND c.status='active'`;if(!shares[0])return c.json({error:'share not found'},404);
  const share=shares[0],rt=runtime(app,c,String(share.conversation_id)),rows=await db()`SELECT * FROM nexusflow.ai_messages WHERE conversation_id=${share.conversation_id} ORDER BY created_at,id`;
  for(const row of rows){const d=row.data as any;if(d.permission_stamp&&d.permission_stamp!==permissionStamp(u)||hasAggregate(d.refs||[])&&d.scope_stamp&&d.scope_stamp!==u.data_scope_stamp||!await referencesAllowed(rt,d.refs||[]))return c.json({error:'forbidden: 接收人缺少会话来源权限或管理范围不同'},403);}
  return c.json({messages:rows.map(row=>({id:row.id,role:row.role,content:row.content,status:row.status,events:[],model_id:(row.data as any).model_id}))});
 });
}
async function hydratedMessages(rt:Runtime){
 const messages=await getMessages(rt);
 for(const message of messages){if(message.redacted)continue;
  if(message.file_ids?.length)message.files=(await prepareFiles(rt.user,message.file_ids,false)).files;
 }
 return messages;
}
async function send(app:ApiApp,c:Context<ApiEnv>,override?:z.infer<typeof sendBody>,retryOf?:string){
 const body=override||sendBody.parse(await c.req.json()),settings=resolveModel(body.model_id,body.thinking_enabled),abort=new AbortController(),rt=runtime(app,c,c.req.param('id'),crypto.randomUUID(),abort.signal);rt.query=body.content;
 const files=await prepareFiles(rt.user,body.file_ids);for(const id of body.file_ids)rt.refs.add(`/api/files/${encodeURIComponent(id)}`);const parent=await createPair(rt,body,settings.snapshot,retryOf);
 return streamSSE(c,async stream=>{
  const events:any[]=[],job=crypto.randomUUID();let seq=0;const started=Date.now();
  rt.emit=async(type,payload)=>{const event={schema_version:'moss.execution.event.v1',event_id:`evt_${job}_${++seq}`,job_id:job,execution_id:rt.messageId,trace_id:`trace_${job}`,agent_id:'nexusflow_default',tenant_id:rt.user.tenant_id,user_id:rt.user.id,session_id:rt.conversationId,response_message_id:rt.messageId,event_seq:seq,event_type:type,occurred_at:new Date().toISOString(),payload:sanitize(payload)};if(type!=='response.delta')events.push(event);try{await stream.writeSSE({event:type,id:event.event_id,data:JSON.stringify(event)});}catch{abort.abort();}};
  const timer=setTimeout(()=>abort.abort(new Error('对话超时')),240000);stream.onAbort(()=>abort.abort());activeRuns.set(rt.messageId,{abort:()=>abort.abort(),userId:rt.user.id});
  try{
   await rt.emit('execution.started',{user_message_id:parent,...settings.snapshot});
   const result=await runKernel(rt,settings,files.context,agent=>activeRuns.set(rt.messageId,{abort:()=>{abort.abort();agent.abort();},userId:rt.user.id}));
   await rt.emit('usage.reported',{usage:result.usage});
   await finish(rt,'completed',result.content,{events,duration_ms:Date.now()-started,usage:result.usage});
   await rt.emit('execution.completed',{content:result.content,...settings.snapshot,duration_ms:Date.now()-started});
  }catch(e){const status=abort.signal.aborted?'cancelled':'failed',error=abort.signal.aborted?'已停止，已提交的操作不会自动撤销':(e as Error).message;await finish(rt,status,'',{events,error,duration_ms:Date.now()-started});await rt.emit(status==='cancelled'?'execution.cancelled':'execution.failed',{error});}
  finally{clearTimeout(timer);activeRuns.delete(rt.messageId);}
 });
}
