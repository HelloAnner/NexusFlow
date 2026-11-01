import { db,getAction,owned } from "./repository.ts";
import { toolSpecs,makeCall,toolAvailable,type ToolSpec } from "./catalog.ts";
import { callApi,fingerprint,permissionStamp,refreshUser,sanitize,type Runtime } from "./transport.ts";
import { addAudit } from "../../shared/audit.ts";
function targetPath(template:string,args:Record<string,any>){const path=template.replace(':id',encodeURIComponent(args.id||'')).replace(':secondary',encodeURIComponent(args.secondary||''));if(path==='/api/v1/rbac/matrix'){const subject=args.data?.subject_id||args.query?.subject_id;if(!subject)throw Error('subject_id required');return `${path}?subject_id=${encodeURIComponent(subject)}`;}return path;}
export async function snapshot(runtime:Runtime,spec:ToolSpec,args:Record<string,any>){
 if(spec.read){const path=spec.read==='/api/admin/users'&&args.id?`/api/admin/users?user_id=${encodeURIComponent(args.id)}`:targetPath(spec.read,args);const raw=await callApi(runtime,{path}),value=path.startsWith('/api/admin/users?user_id=')?raw.items?.find((item:any)=>item.id===args.id):raw;if(!value)throw Error('target not found');if(spec.name==='files_rollback')return {file:value,versions:await callApi(runtime,{path:`/api/files/${encodeURIComponent(args.id)}/versions`})};return value;}
 const refs:Record<string,any>={};for(const [field,collection] of [['project_id','projects'],['task_id','tasks'],['org_id','orgs'],['parent_id','orgs']] as const){const id=args.data?.[field];if(typeof id==='string'&&id)refs[field]=await callApi(runtime,{path:`/api/${collection}/${encodeURIComponent(id)}`});}return refs;
}
function automatic(spec:ToolSpec,args:Record<string,any>,query:string,userId:string,before:Record<string,any>){
 if(/不执行|不要修改|不要执行|只读|仅查看/.test(query))return false;
 if(spec.name==='inbox_read')return /(?:标记|设为).*(?:已读)/u.test(query);
 if(['tasks_report','task_assignments_report'].includes(spec.name))return (before.owner_id===userId||before.user_id===userId)&&/(?:填报|更新|记录).*(?:我的|进度|工时)/u.test(query)&&args.data?.person_id===undefined;
 if(spec.name==='tasks_update')return before.owner_id===userId&&/(?:修改|更新|添加).*(?:备注|说明|描述|概述)/u.test(query)&&Object.keys(args.data||{}).every(key=>['summary','description','note'].includes(key));
 if(['tasks_create','projects_create'].includes(spec.name))return /(?:新建|创建|新增).*(?:草稿)/u.test(query);
 return false;
}
export async function propose(runtime:Runtime,spec:ToolSpec,args:Record<string,any>){
 await refreshUser(runtime);if(!toolAvailable(runtime.user,spec))throw Error('forbidden: tool not permitted');makeCall(spec,args);
 const before=await snapshot(runtime,spec,args);
 const preview=spec.name==='tasks_reschedule'?await callApi(runtime,{path:`/api/planning/preview/${encodeURIComponent(args.id)}`,method:'POST',body:args.data}):{requires_confirmation:true,note:'按原业务规则执行；涉及审批不会自动替他人通过。'};
 const hash=fingerprint([spec.name,args]),id=crypto.randomUUID(),expires=new Date(Date.now()+15*60000);
 const data={tool:spec.name,label:spec.label,args:sanitize(args),before,preview,permission_stamp:permissionStamp(runtime.user)};
 const rows=await db()`INSERT INTO nexusflow.ai_actions(id,conversation_id,message_id,tenant_id,user_id,fingerprint,data,expires_at) VALUES(${id},${runtime.conversationId},${runtime.messageId},${runtime.user.tenant_id!},${runtime.user.id},${hash},${db().json(data as any)},${expires}) ON CONFLICT(message_id,fingerprint) DO UPDATE SET updated_at=nexusflow.ai_actions.updated_at RETURNING id`;
 const result=await getAction(runtime.user,String(rows[0].id));
 await addAudit(db(),runtime.user,'ai.action.propose','ai_action',result.id,{tool:spec.name,conversation_id:runtime.conversationId,message_id:runtime.messageId});
 if(automatic(spec,args,runtime.query,runtime.user.id,before))return confirm(runtime,result.id);
 await runtime.emit('action.proposed',{action:result});
 return {status:'waiting_for_user',action_id:result.id,message:'已生成操作预览，尚未执行。用户必须点击确认或使用 CLI 确认；不要声称成功。'};
}
export async function confirm(runtime:Runtime,id:string,approvedBatch=false){
 await refreshUser(runtime);const initial=await getAction(runtime.user,id);
 await owned(runtime.user,runtime.conversationId);
 const spec=toolSpecs.find(s=>s.name===initial.tool);if(!spec||!toolAvailable(runtime.user,spec))throw Error('forbidden: tool permission changed');
 if(!approvedBatch&&permissionStamp(runtime.user)!==initial.permission_stamp)throw Error('permission changed; propose again');
 if(initial.status!=='pending'){if(spec.method!=='DELETE')await snapshot(runtime,spec,initial.args);return initial;}
 const before=await snapshot(runtime,spec,initial.args);
 if(fingerprint(before)!==fingerprint(initial.before))throw Error('object changed; propose again');
 if(spec.name==='tasks_reschedule')await callApi(runtime,{path:`/api/planning/preview/${encodeURIComponent(initial.args.id)}`,method:'POST',body:initial.args.data});
 const claimed=await db()`UPDATE nexusflow.ai_actions SET status='executing',updated_at=now() WHERE id=${id} AND user_id=${runtime.user.id} AND tenant_id=${runtime.user.tenant_id!} AND conversation_id=${runtime.conversationId} AND status='pending' AND expires_at>now() RETURNING id`;
 if(!claimed.length){const current=await getAction(runtime.user,id);if(current.status==='pending')throw Error('preview expired; propose again');return current;}
 let committed=false;
 try{
  const call=makeCall(spec,initial.args),version=initial.before?.updated_at||initial.before?.file?.updated_at;
  if(version)call.expectedVersion=version;
  if(version&&spec.name==='admin_profile')call.body={...(call.body as any),updated_at:version};
  if(spec.name==='files_rollback')call.body={...(call.body as any),expected_latest_version_id:initial.before.versions.items.at(-1)?.id};
  if(call.body&&initial.before?.updated_at)call.body={...(call.body as any),...(spec.name==='tasks_reschedule'?{expected_updated_at:initial.before.updated_at}:{})};
  const result=await callApi(runtime,call);committed=true;
  let after:unknown=result;
  if(spec.read&&spec.method!=='DELETE'){try{after=await snapshot(runtime,spec,initial.args);}catch{after={readback_unavailable:true,message:'写入已提交，当前权限或会话已变化，请重新登录回读'};}}
  await db().begin(async tx=>{
   await tx`UPDATE nexusflow.ai_actions SET status='succeeded',data=data||${tx.json({result:{response:result,readback:after},...(runtime.secureResult?{encrypted_result:runtime.secureResult,secure_result_available:true}:{})} as any)},updated_at=now() WHERE id=${id}`;
   await addAudit(tx,runtime.user,'ai.action.confirm','ai_action',id,{tool:spec.name,conversation_id:runtime.conversationId,message_id:runtime.messageId,result:'success'});
  });
 }catch(error){
  const text=error instanceof Error?error.message:'operation failed';
  // HTTP 服务可能已提交但回包失败。绝不重放不确定写入。
  const status=committed||runtime.signal.aborted||!/^(invalid|forbidden|.*required|.*not found|.*changed|.*must|.*conflict)/i.test(text)?'uncertain':'failed';
  await db()`UPDATE nexusflow.ai_actions SET status=${status},data=data||${db().json({error:text} as any)},updated_at=now() WHERE id=${id}`;
  await addAudit(db(),runtime.user,'ai.action.failed','ai_action',id,{tool:spec.name,result:status},'failure');
 }
 return getAction(runtime.user,id);
}
