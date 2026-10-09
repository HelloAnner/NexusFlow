import type { Context } from "hono";
import { sql } from "./db.ts";

export type User = { id:string; username:string; role:string; tenant_id:string|null; org_id:string|null; portal_permissions:string[]|null };
const managers = new Set(["super_admin","center_director","center_deputy","department_director","department_deputy"]);
const scopedManagers = new Set(["center_deputy","department_director","department_deputy"]);
export function canManage(user:User) { return managers.has(user.role); }
export function allowedAction(user:User,kind:string,action:"read"|"write") {
  if(action==="read")return true;
  if(user.role==="super_admin"||user.role==="center_director")return true;
  if(["admin","config","orgs","people","visibility_grants","invitations"].includes(kind))return scopedManagers.has(user.role);
  if(["approvals","dispatch","conflicts"].includes(kind))return canManage(user)||user.role==="project_lead";
  if(kind==="tools")return canManage(user);
  if(kind==="projects")return canManage(user);
  if(kind==="task_assignments")return canManage(user)||user.role==="project_lead"||user.role==="member";
  return ["tasks","files"].includes(kind);
}
async function grant(user:User,projectId:string,action:"view"|"edit"|"dispatch") {
  if(!sql)return false;
  const rows=await sql`SELECT 1 FROM nexusflow.records WHERE kind='visibility_grants' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'project_id'=${projectId} AND data->>'user_id'=${user.id} AND data->'actions' ? ${action} AND coalesce(data->>'status','active')='active' AND (data->>'expires_at' IS NULL OR (data->>'expires_at')::timestamptz>now()) LIMIT 1`;
  return rows.length>0;
}
async function project(user:User,id:string) {
  if(!sql)return null;
  const rows=await sql`SELECT id,tenant_id,created_by,data FROM nexusflow.records WHERE id=${id} AND kind='projects' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id})`;
  return rows[0]||null;
}
async function orgWithin(user:User,orgId:string|null) {
  if(!orgId)return false;
  if(["super_admin","center_director"].includes(user.role))return true;
  if(!sql)return orgId===user.org_id;
  let roots=[user.org_id||""];
  if(["center_deputy","department_deputy"].includes(user.role)){const rows=await sql`SELECT data FROM nexusflow.records WHERE kind='role_delegations' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'user_id'=${user.id} AND data->>'status'='active'`,delegated=rows.flatMap((r:any)=>Array.isArray(r.data?.org_ids)?r.data.org_ids.map(String):[]);roots=[...new Set([...(user.role==="department_deputy"?[user.org_id||""]:[]),...delegated].filter(Boolean))];if(!roots.length)return false;}
  if(!user.org_id&&!["center_deputy","department_deputy"].includes(user.role))return false;
  if(roots.includes(orgId))return true;
  const rows=await sql`SELECT id,data FROM nexusflow.records WHERE kind='orgs' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;
  const parents=new Map(rows.map((r:any)=>[String(r.id),String((r.data as any).parent_id||"")]));
  let current=orgId;
  for(let depth=0;depth<64&&current;depth++){current=parents.get(current)||"";if(roots.includes(current))return true;}
  return false;
}
export async function canManageOrganization(user:User,orgId:string){return canManage(user)&&orgWithin(user,orgId);}
export async function canEditTask(user:User,task:Record<string,any>){if(task.project_id&&!await canProjectAction(user,String(task.project_id),"edit"))return false;if(canManage(user))return !task.org_id||canManageOrganization(user,String(task.org_id));return task.owner_id===user.id;}
async function relatedOrg(user:User,kind:string,data:Record<string,unknown>):Promise<string|null>{
  if(typeof data.org_id==="string"&&data.org_id)return data.org_id;
  if(!sql)return null;
  const projectId=String(data.project_id||"");
  if(projectId){const p=await project(user,projectId);if(p)return String((p.data as any).org_id||"")||null;}
  const taskId=String(data.task_id||(kind==="tasks"?data.id:""));
  if(taskId){const rows=await sql`SELECT data FROM nexusflow.records WHERE id=${taskId} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;const t=rows[0]?.data as Record<string,unknown>|undefined;if(t){if(typeof t.org_id==="string"&&t.org_id)return t.org_id;if(typeof t.project_id==="string"){const p=await project(user,t.project_id);if(p)return String((p.data as any).org_id||"")||null;}if(typeof t.owner_id==="string"){const owner=await sql`SELECT org_id FROM nexusflow.users WHERE id=${t.owner_id} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(owner[0]?.org_id)return String(owner[0].org_id);}}}
  const personId=String(data.person_id||data.owner_id||data.user_id||"");
  if(personId){const u=await sql`SELECT org_id FROM nexusflow.users WHERE id=${personId} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(u[0]?.org_id)return String(u[0].org_id);const p=await sql`SELECT data->>'org_id' org_id FROM nexusflow.records WHERE kind='people' AND (id=${personId} OR data->>'user_id'=${personId}) AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(p[0]?.org_id)return String(p[0].org_id);}
  if(kind==="dispatch"&&Array.isArray(data.target_org_ids)&&data.target_org_ids.length===1)return String(data.target_org_ids[0]);
  return null;
}
async function isProjectMember(user:User,p:Record<string,any>) {const d=p.data as Record<string,unknown>;return d.owner_id===user.id||(Array.isArray(d.member_ids)&&d.member_ids.includes(user.id));}
export async function canProjectAction(user:User,projectId:string,action:"view"|"edit"|"dispatch"="edit") {
  const p=await project(user,projectId);if(!p)return false;
  const d=p.data as Record<string,unknown>,member=await isProjectMember(user,p),within=await orgWithin(user,String(d.org_id||"")||null);
  if(["super_admin","center_director"].includes(user.role))return true;
  if((d.visibility==="hidden"||d.visibility==="restricted")&&!member)return grant(user,projectId,action);
  if(member)return true;
  return canManage(user)&&within;
}
export async function canReadRecord(user:User,kind:string,row:{id?:string;tenant_id:string|null;created_by:string|null;data:Record<string,unknown>}):Promise<boolean> {
  if(user.role!=="super_admin"&&row.tenant_id!==user.tenant_id)return false;
  const d=row.data;
  if(["invitations","admin","config","config_versions","visibility_grants"].includes(kind))return canManage(user)&&(!d.org_id||await orgWithin(user,String(d.org_id)));if(kind==="reports")return row.created_by===user.id||canManage(user)&&(!d.org_id||await orgWithin(user,String(d.org_id)));
  if(kind==="people"){if(["super_admin","center_director"].includes(user.role))return true;if(scopedManagers.has(user.role))return Boolean(d.org_id&&await orgWithin(user,String(d.org_id)));return d.user_id===user.id;}
  if(kind==="orgs"){
    if(!scopedManagers.has(user.role))return true;if(!sql)return false;
    const rows=await sql`SELECT id,data FROM nexusflow.records WHERE kind='orgs' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`,parents=new Map(rows.map((r:any)=>[String(r.id),String((r.data as any).parent_id||"")]));let roots=[user.org_id||""];
    if(["center_deputy","department_deputy"].includes(user.role)){const grants=await sql`SELECT data FROM nexusflow.records WHERE kind='role_delegations' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'user_id'=${user.id} AND data->>'status'='active'`;roots=[...new Set([...(user.role==="department_deputy"?[user.org_id||""]:[]),...grants.flatMap((r:any)=>Array.isArray(r.data?.org_ids)?r.data.org_ids.map(String):[])].filter(Boolean))];}
    const ancestors=(id:string)=>{const path=new Set<string>();let current=id;for(let i=0;i<64&&current;i++){path.add(current);current=parents.get(current)||"";}return path;};
    return roots.some(root=>ancestors(root).has(String(row.id||""))||ancestors(String(row.id||"")).has(root));
  }
  if(kind==="tools")return true;
  if(kind==="projects"){
    const within=await orgWithin(user,String(d.org_id||"")||null),member=d.owner_id===user.id||(Array.isArray(d.member_ids)&&d.member_ids.includes(user.id)),viewGrant=await grant(user,String(row.id||d.id||""),"view");
    if(["hidden","restricted"].includes(String(d.visibility))&&!member&&!(["super_admin","center_director"].includes(user.role))&&!viewGrant)return false;
    return ["super_admin","center_director"].includes(user.role)||(canManage(user)&&within)||member||viewGrant;
  }
  if(kind==="inbox")return d.user_id===user.id;
  if(kind==="task_assignments"){if(!sql)return false;const rows=await sql`SELECT id,tenant_id,created_by,data FROM nexusflow.records WHERE id=${String(d.task_id||"")} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;const task=rows[0];if(!task||!await canReadRecord(user,"tasks",{id:String(task.id),tenant_id:task.tenant_id??null,created_by:task.created_by??null,data:task.data as Record<string,unknown>}))return false;return d.user_id===user.id||row.created_by===user.id||canManage(user);}
  if(kind==="approvals"){if(d.approver_id===user.id||row.created_by===user.id)return true;return canManage(user)&&await orgWithin(user,String(d.target_org_id||"")||null);}
  if(kind==="mentions"){
    if(d.user_id!==user.id||!sql)return false;
    const source=await sql`SELECT id,tenant_id,created_by,data FROM nexusflow.records WHERE id=${String(d.source_id||"")} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;
    return Boolean(source[0]&&await canReadRecord(user,"tasks",{id:String(source[0].id),tenant_id:source[0].tenant_id??null,created_by:source[0].created_by??null,data:source[0].data as Record<string,unknown>}));
  }
  if(kind==="dispatch"){
    const targets=Array.isArray(d.target_org_ids)?d.target_org_ids as string[]:[];
    if(d.requester_id!==user.id&&!targets.includes(String(user.org_id||""))){if(!canManage(user)||!targets.length)return false;for(const target of targets)if(!await orgWithin(user,target))return false;}
  }
  const projectId=String(d.project_id||"");
  if(projectId&&["tasks","task_assignments","files","worklogs","conflicts","dispatch"].includes(kind)){
    const p=await project(user,projectId);if(!p)return false;
    if(["hidden","restricted"].includes(String((p.data as any).visibility))&&!await canProjectAction(user,projectId,"view"))return false;
  }
  const org=await relatedOrg(user,kind,d),projectView=projectId?await canProjectAction(user,projectId,"view"):false;
  if(scopedManagers.has(user.role)&&["tasks","task_assignments","dispatch","approvals","files","worklogs","conflicts","mentions"].includes(kind)&&!(kind==="dispatch"&&d.requester_id===user.id)&&!await orgWithin(user,org)&&!projectView)return false;
  if(kind==="tasks"||kind==="task_assignments"||kind==="dispatch"||kind==="approvals"||kind==="files"||kind==="worklogs"||kind==="conflicts"){
    if(kind==="files"&&!d.project_id&&!d.task_id)return d.uploaded_by===user.id||row.created_by===user.id;
    if(kind==="files"&&d.access_scope==="uploader"){const owner=d.uploaded_by===user.id;if(!owner&&!(canManage(user)&&await orgWithin(user,org)))return false;if(projectId)return projectView||canManage(user)&&await orgWithin(user,org);if(d.task_id&&sql){const tasks=await sql`SELECT id,tenant_id,created_by,data FROM nexusflow.records WHERE id=${String(d.task_id)} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;return Boolean(owner&&tasks[0]&&await canReadRecord(user,"tasks",{id:String(tasks[0].id),tenant_id:tasks[0].tenant_id??null,created_by:tasks[0].created_by??null,data:tasks[0].data as Record<string,unknown>}));}return owner;}
    const member=d.owner_id===user.id||d.person_id===user.id||d.user_id===user.id||(kind==="dispatch"&&d.requester_id===user.id)||(Array.isArray(d.member_ids)&&d.member_ids.includes(user.id));
    if(kind==="files"&&d.task_id&&sql){const tasks=await sql`SELECT id,tenant_id,created_by,data FROM nexusflow.records WHERE id=${String(d.task_id)} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(tasks[0]&&await canReadRecord(user,"tasks",{id:String(tasks[0].id),tenant_id:tasks[0].tenant_id??null,created_by:tasks[0].created_by??null,data:tasks[0].data as Record<string,unknown>}))return true;}
    if(member||row.created_by===user.id)return true;
    if(projectView&&["tasks","task_assignments","files","worklogs","conflicts"].includes(kind))return true;
    if(canManage(user))return true;
    if(projectId){const p=await project(user,projectId);return Boolean(p&&await isProjectMember(user,p));}
    return false;
  }
  return false;
}
export async function canWriteRecord(user:User,kind:string,row:{id?:string;tenant_id:string|null;created_by:string|null;data:Record<string,unknown>},action:"create"|"update"|"delete") {
  if(!allowedAction(user,kind,"write")&&!(kind==="dispatch"&&action==="create"&&row.data.workflow==="supplemental"))return false;
  if(["approvals","inbox","conflicts","worklogs","load","seed","config_versions","mentions","files"].includes(kind))return false;
  if(action==="create"){
    if(kind==="dispatch"&&row.data.workflow==="supplemental"){if(!sql)return false;const rows=await sql`SELECT created_by,data FROM nexusflow.records WHERE id=${String(row.data.task_id||"")} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`,task=rows[0];if(!task||!canManage(user)&&task.created_by!==user.id&&(task.data as any).owner_id!==user.id)return false;}
    if(row.tenant_id!==user.tenant_id&&user.role!=="super_admin")return false;
    if(kind==="tasks"){
      if(!canManage(user)&&user.role!=="project_lead"&&row.data.owner_id!==user.id)return false;
      const org=await relatedOrg(user,kind,row.data);if(scopedManagers.has(user.role)&&!await orgWithin(user,org))return false;
      if(row.data.project_id&&!await canProjectAction(user,String(row.data.project_id),"edit"))return false;
    }
    if(kind==="projects"&&!canManage(user))return false;
    if(kind==="task_assignments"){if(!sql)return false;const rows=await sql`SELECT id,tenant_id,created_by,data FROM nexusflow.records WHERE id=${String(row.data.task_id||"")} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;const task=rows[0];if(!task||!await canReadRecord(user,"tasks",{id:String(task.id),tenant_id:task.tenant_id??null,created_by:task.created_by??null,data:task.data as Record<string,unknown>}))return false;if((task.data as any).project_id&&!await canProjectAction(user,String((task.data as any).project_id),"edit"))return false;if(action==="create")return canManage(user)||user.role==="project_lead"||(task.data as any).owner_id===user.id;}
    return true;
  }
  const visible=await canReadRecord(user,kind,row);
  if(!visible)return false;
  const projectId=String(row.data.project_id||"");if(projectId&&["tasks","files"].includes(kind)&&!await canProjectAction(user,projectId,"edit"))return false;
  if(canManage(user))return true;
  return row.created_by===user.id||row.data.owner_id===user.id||row.data.user_id===user.id;
}
export function actor(c:Context):User { return c.get("user") as User; }
