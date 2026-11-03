import { db } from './repository.ts';
import { toolSpecs,toolAvailable } from './catalog.ts';
import { callApi,type Runtime } from './transport.ts';

// 聚合历史可能因自己创建/调整成员而失效。只补充已执行操作的当前对象身份，
// 不恢复旧回答、统计、before 快照或授权信息；每个对象仍须通过原 API 重新鉴权。
export async function recentActionContext(runtime:Runtime){
 const rows=await db()`SELECT id,data FROM nexusflow.ai_actions WHERE conversation_id=${runtime.conversationId} AND tenant_id=${runtime.user.tenant_id!} AND user_id=${runtime.user.id} AND status='succeeded' ORDER BY updated_at DESC LIMIT 12`;
 const result=[];
 for(const row of rows){
  const spec=toolSpecs.find(s=>s.name===(row.data as any).tool);
  if(!spec||!toolAvailable(runtime.user,spec)||!['orgs','people','projects','tasks','task_assignments','dispatch','approvals','files','inbox','config','tools','invitations','visibility_grants','worklogs','milestones'].includes(spec.domain))continue;
  const response=(row.data as any).result?.response,id=response?.id||response?.task?.id||(row.data as any).args?.id;
  if(typeof id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(id))continue;
  try{
   const current=await callApi(runtime,{path:`/api/${spec.domain}/${encodeURIComponent(id)}`});
   result.push({action_id:String(row.id),tool:spec.name,status:'succeeded',object:{id:current.id,name:typeof current.name==='string'?current.name.slice(0,240):undefined,status:current.status}});
  }catch(error){runtime.signal.throwIfAborted();/* 当前无权读取、已删除或暂不可用的对象不进入上下文。 */}
 }
 return result;
}
