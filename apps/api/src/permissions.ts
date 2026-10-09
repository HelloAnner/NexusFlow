import type { Context } from "hono";
import { sql } from "./db.ts";

export type User = { id:string; username:string; role:string; tenant_id:string|null; org_id:string|null; portal_permissions:string[]|null };
const managers = new Set(["super_admin","center_director","center_deputy","department_director","department_deputy"]);
export function canManage(user:User) { return managers.has(user.role); }
export function allowedAction(user:User, kind:string, action:"read"|"write") {
  if (user.role === "super_admin" || user.role === "center_director") return true;
  if (action === "read") return true;
  if (["admin","config","orgs","people","visibility_grants","invitations","registrations"].includes(kind)) return ["center_deputy","department_director","department_deputy"].includes(user.role);
  if (["approvals","dispatch","conflicts"].includes(kind)) return managers.has(user.role) || user.role === "project_lead";
  if (kind === "tools") return managers.has(user.role);
  if(kind==="projects")return canManage(user);
  if (["tasks","files","mentions"].includes(kind)) return true;
  return false;
}
async function hasProjectGrant(user:User, projectId:string, action="view") {
  if (!sql) return false;
  const [projectRows, grants] = await Promise.all([
    sql`SELECT data FROM nexusflow.records WHERE id=${projectId} AND kind='projects' AND (${user.role==='super_admin'} OR tenant_id=${user.tenant_id} OR (tenant_id IS NULL AND created_by=${user.id}))`,
    sql`SELECT 1 FROM nexusflow.records WHERE kind='visibility_grants' AND tenant_id=${user.tenant_id} AND data->>'project_id'=${projectId} AND data->>'user_id'=${user.id} AND (data->'actions' ? ${action} OR data->'actions' ? 'view') AND (data->>'expires_at' IS NULL OR (data->>'expires_at')::timestamptz>now()) LIMIT 1`,
  ]);
  const project=projectRows[0]?.data as Record<string,unknown>|undefined;
  if (!project) return false;
  if (project.visibility !== "hidden" && project.visibility !== "restricted") return true;
  if (["super_admin","center_director"].includes(user.role)) return true;
  if (project.owner_id===user.id || (Array.isArray(project.member_ids) && project.member_ids.includes(user.id))) return true;
  return grants.length > 0;
}
async function relatedOrg(user:User,kind:string,d:Record<string,unknown>):Promise<string|null>{if(typeof d.org_id==="string")return d.org_id;if(kind==="dispatch"){const targets=d.target_org_ids;return Array.isArray(targets)&&targets.length===1?String(targets[0]):null;}if(!sql)return null;const projectId=String(d.project_id||"");if(projectId){const rows=await sql`SELECT data->>'org_id' org_id FROM nexusflow.records WHERE kind='projects' AND id=${projectId} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(rows[0]?.org_id)return rows[0].org_id;}const taskId=String(d.task_id||"");if(taskId){const rows=await sql`SELECT data->>'org_id' org_id,data->>'project_id' project_id FROM nexusflow.records WHERE kind='tasks' AND id=${taskId} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(rows[0]?.org_id)return rows[0].org_id;if(rows[0]?.project_id){const projects=await sql`SELECT data->>'org_id' org_id FROM nexusflow.records WHERE kind='projects' AND id=${rows[0].project_id} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(projects[0]?.org_id)return projects[0].org_id;}}const personId=String(d.person_id||"");if(personId){const rows=await sql`SELECT data->>'org_id' org_id FROM nexusflow.records WHERE kind='people' AND (id=${personId} OR data->>'user_id'=${personId}) AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(rows[0]?.org_id)return rows[0].org_id;}return null;}
async function projectMember(user:User,projectId:string) {
  if(!sql)return false;
  const rows=await sql`SELECT data FROM nexusflow.records WHERE id=${projectId} AND kind='projects' AND (${user.role==='super_admin'} OR tenant_id=${user.tenant_id} OR (tenant_id IS NULL AND created_by=${user.id}))`;
  const project=rows[0]?.data as Record<string,unknown>|undefined;
  return Boolean(project&&(project.owner_id===user.id||(Array.isArray(project.member_ids)&&project.member_ids.includes(user.id))));
}
export async function canReadRecord(user:User,kind:string,row:{id?:string;tenant_id:string|null;created_by:string|null;data:Record<string,unknown>}) {
  if (user.role === "super_admin") return true;
  if (user.role === "center_director") return !row.tenant_id || row.tenant_id===user.tenant_id;
  if (row.tenant_id && row.tenant_id !== user.tenant_id) return false;
  const d=row.data;
  const projectId=kind==="visibility_grants"?"":String(d.project_id|| (kind==="projects"?d.id||"":""));
  if (projectId && !(await hasProjectGrant(user,projectId))) return false;
  if(kind==="visibility_grants"||kind==="invitations"||kind==="registrations"||kind==="admin"||kind==="config"||kind==="reports"||kind==="config_versions")return canManage(user)&&(!d.org_id||["super_admin","center_director"].includes(user.role)||d.org_id===user.org_id);
  if (["people","orgs","tools"].includes(kind)) {
    if ((user.role.startsWith("department_") || user.role === "center_deputy") && d.org_id && d.org_id!==user.org_id) return false;
    return true;
  }
  if (kind === "projects") {
    if ((user.role.startsWith("department_") || user.role === "center_deputy") && d.org_id && d.org_id!==user.org_id) return false;
    if (d.visibility === "hidden" || d.visibility === "restricted") return ["super_admin","center_director"].includes(user.role) || d.owner_id===user.id || (Array.isArray(d.member_ids)&&d.member_ids.includes(user.id)) || await hasProjectGrant(user,String(row.id||d.id||""));
    return canManage(user) || d.owner_id===user.id || (Array.isArray(d.member_ids)&&d.member_ids.includes(user.id)) || await projectMember(user,String(row.id||d.id||""));
  }
  if (kind === "inbox") return d.user_id===user.id;
  if(kind==="approvals")return d.approver_id===user.id||row.created_by===user.id;
  if(kind==="dispatch"&&!canManage(user))return d.requester_id===user.id||(Array.isArray(d.target_org_ids)&&d.target_org_ids.includes(user.org_id));
  if(["department_director","department_deputy","center_deputy"].includes(user.role)&&["dispatch","approvals","files","worklogs","conflicts","mentions"].includes(kind)){const org=await relatedOrg(user,kind,d);if(!org||org!==user.org_id)return false;}
  if(["department_director","department_deputy","center_deputy"].includes(user.role)&&kind==="tasks"&&d.org_id&&d.org_id!==user.org_id)return false;
  if (kind === "tasks" || kind === "dispatch" || kind === "approvals" || kind === "files" || kind === "worklogs" || kind === "conflicts" || kind === "mentions") {
    const memberOfProject=projectId?await projectMember(user,projectId):false;
    return canManage(user) || row.created_by===user.id || d.owner_id===user.id || d.created_by===user.id || d.person_id===user.id || d.user_id===user.id || (Array.isArray(d.member_ids)&&d.member_ids.includes(user.id)) || memberOfProject;
  }
  return false;
}
export async function canWriteRecord(user:User,kind:string,row:{id?:string;tenant_id:string|null;created_by:string|null;data:Record<string,unknown>},action:"create"|"update"|"delete") {
  if(!allowedAction(user,kind,"write"))return false;
  if(["approvals","inbox","conflicts","worklogs","load","seed","config_versions","mentions"].includes(kind))return false;
  if(action==="create") {
    if(row.tenant_id && user.tenant_id && row.tenant_id!==user.tenant_id)return false;
    if(kind==="tasks"&&!canManage(user)&&user.role!=="project_lead"&&row.data.owner_id!==user.id)return false;
    if(user.role==="project_lead"&&kind==="tasks"&&(row.data.project_id?!await projectMember(user,String(row.data.project_id)):row.data.owner_id!==user.id))return false;
    return true;
  }
  return (await canReadRecord(user,kind,row))&&(canManage(user)||row.created_by===user.id||row.data.owner_id===user.id||row.data.user_id===user.id||user.role==="project_lead"&&kind==="tasks");
}
export function actor(c:Context):User { return c.get("user") as User; }
