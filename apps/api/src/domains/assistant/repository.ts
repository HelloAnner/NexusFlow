import { sql } from "../../db.ts";
import type { User } from "../../permissions.ts";
import { sanitize,permissionStamp,referencesAllowed,hasAggregate,type Runtime } from "./transport.ts";
export function db(){if(!sql)throw Error("DATABASE_URL required");return sql;}
export async function owned(user:User,id:string){const rows=await db()`SELECT * FROM nexusflow.ai_conversations WHERE id=${id} AND tenant_id=${user.tenant_id!} AND user_id=${user.id} AND status='active'`;if(!rows[0])throw Error("conversation not found");return rows[0];}
export async function getMessages(runtime:Runtime){
 await owned(runtime.user,runtime.conversationId);
 const rows=await db()`SELECT * FROM nexusflow.ai_messages WHERE conversation_id=${runtime.conversationId} AND tenant_id=${runtime.user.tenant_id!} AND user_id=${runtime.user.id} ORDER BY message_order`;
 const result=[];
 for(const row of rows){const data=row.data as any;
  const allowed=(row.role==='user'||!data.permission_stamp||data.permission_stamp===permissionStamp(runtime.user))&&(!hasAggregate(data.refs||[])||!data.scope_stamp||data.scope_stamp===runtime.user.data_scope_stamp)&&await referencesAllowed(runtime,data.refs||[]);
  const events=allowed?sanitize(data.events||[]):[];
  for(const event of events)if(event.event_type==='action.proposed'){try{event.payload.action=await getAction(runtime.user,event.payload.action.id);}catch{event.payload.action={id:event.payload.action.id,label:'操作已不可用',status:'cancelled',args:{},before:null,preview:null};}}
  result.push({id:row.id,role:row.role,content:allowed?row.content:"",status:row.status,parent_id:row.parent_id,...sanitize(allowed?data:{redacted:true}),events,created_at:row.created_at});
 }
 return result;
}
export async function createPair(runtime:Runtime,request:{content:string;client_request_id:string;file_ids:string[]},snapshot:Record<string,any>,retryOf?:string){
 await owned(runtime.user,runtime.conversationId);
 return db().begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext(${`ai-user:${runtime.user.tenant_id}:${runtime.user.id}`}))`;
  const running=await tx`SELECT count(*) total FROM nexusflow.ai_messages WHERE tenant_id=${runtime.user.tenant_id!} AND user_id=${runtime.user.id} AND status='answering'`;
  if(Number(running[0]?.total||0)>=2)throw Error('already running two conversations; wait or cancel');
  await tx`SELECT id FROM nexusflow.ai_conversations WHERE id=${runtime.conversationId} FOR UPDATE`;
  const active=await tx`SELECT id FROM nexusflow.ai_messages WHERE conversation_id=${runtime.conversationId} AND status='answering' LIMIT 1`;
  if(active.length)throw Error("conversation already answering");
  const duplicate=await tx`SELECT id FROM nexusflow.ai_messages WHERE tenant_id=${runtime.user.tenant_id!} AND user_id=${runtime.user.id} AND request_id=${request.client_request_id}`;
  if(duplicate.length)throw Error("request already exists; read conversation before retrying");
  const parent=crypto.randomUUID();
  await tx`INSERT INTO nexusflow.ai_messages(id,conversation_id,tenant_id,user_id,role,content,status,request_id,data) VALUES(${parent},${runtime.conversationId},${runtime.user.tenant_id!},${runtime.user.id},'user',${request.content},'completed',${request.client_request_id},${tx.json({file_ids:request.file_ids,refs:request.file_ids.map(id=>`/api/files/${encodeURIComponent(id)}`),permission_stamp:permissionStamp(runtime.user)} as any)})`;
  await tx`INSERT INTO nexusflow.ai_messages(id,conversation_id,tenant_id,user_id,role,status,parent_id,data) VALUES(${runtime.messageId},${runtime.conversationId},${runtime.user.tenant_id!},${runtime.user.id},'assistant','answering',${parent},${tx.json({...snapshot,retry_of:retryOf||null,permission_stamp:permissionStamp(runtime.user),events:[]} as any)})`;
  await tx`UPDATE nexusflow.ai_conversations SET updated_at=now() WHERE id=${runtime.conversationId}`;
  return parent;
 });
}
export async function finish(runtime:Runtime,status:string,content:string,data:Record<string,any>){
 await db()`UPDATE nexusflow.ai_messages SET status=${status},content=${content},data=data||${db().json({...sanitize(data),refs:[...runtime.refs],scope_stamp:runtime.user.data_scope_stamp,permission_stamp:permissionStamp(runtime.user)} as any)},updated_at=now() WHERE id=${runtime.messageId} AND user_id=${runtime.user.id} AND tenant_id=${runtime.user.tenant_id!} AND status IN ('answering','cancelled')`;
}
export async function getAction(user:User,id:string){
 const rows=await db()`SELECT a.* FROM nexusflow.ai_actions a JOIN nexusflow.ai_conversations c ON c.id=a.conversation_id AND c.status='active' WHERE a.id=${id} AND a.user_id=${user.id} AND a.tenant_id=${user.tenant_id!}`;
 if(!rows[0])throw Error("action not found");return {id:rows[0].id,status:rows[0].status,...sanitize(rows[0].data),expires_at:rows[0].expires_at};
}
