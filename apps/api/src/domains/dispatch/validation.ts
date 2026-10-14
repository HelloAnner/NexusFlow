import { sql } from "../../db.ts";
import { getRecord } from "../../records.ts";
import { canManage,type User } from "../../permissions.ts";
import { taskTargetOrganizations } from "../../shared/record-relations.ts";
function db(){if(!sql)throw new Error("DATABASE_URL required");return sql;}
export async function validateDispatchCreate(user:User,data:Record<string,any>){
 const kind="dispatch";
 if(kind==="dispatch"){if(data.status!=="draft")throw new Error("new dispatches must start in draft");const task=await getRecord(user,"tasks",String(data.task_id));if(!task)throw new Error("task unavailable");if(task.status!=="draft")throw new Error("dispatch task must be a draft");if(data.workflow==="supplemental"){const origin=await db()`SELECT created_by FROM nexusflow.records WHERE id=${String(task.id)} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(!origin[0]||data.requester_id!==String(origin[0].created_by))throw new Error("supplemental requester must be the original task requester");if(user.id!==String(origin[0].created_by)&&user.id!==String(task.owner_id)&&!canManage(user))throw new Error("only the requester, task owner, or manager may prepare supplemental dispatch");}else if(data.requester_id!==user.id)throw new Error("dispatch requester must be the current user");const targets=await taskTargetOrganizations(user,task),requested=Array.isArray(data.target_org_ids)?[...new Set(data.target_org_ids.map(String))]:[];if(requested.length&&(requested.length!==targets.length||requested.some(org=>!targets.includes(org))))throw new Error("dispatch targets must exactly match actual assignee organizations");data.target_org_ids=targets;}
}
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="dispatch")throw new Error("use dispatch workflow actions to change dispatch records");
}
export async function lockDispatchCreate(tx:any,user:User,kind:string,id:string,data:Record<string,any>){if(kind==="dispatch"){const locked=await tx`SELECT data FROM nexusflow.records WHERE id=${String(data.task_id)} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;if(!locked[0]||(locked[0].data as any).status!=="draft")throw new Error("dispatch task is no longer a draft");const targets=await taskTargetOrganizations(user,{...(locked[0].data as any),id:String(data.task_id)});if(targets.length!==((data.target_org_ids as string[])||[]).length||targets.some(org=>!(data.target_org_ids as string[]).includes(org)))throw new Error("dispatch targets changed; recreate dispatch");}}
