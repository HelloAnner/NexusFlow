import type { User } from "../../permissions.ts";
import { activeUsers } from "../people/service.ts";
function db(){if(!sql)throw new Error("DATABASE_URL required");return sql;}
import { actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { getRecord } from "../../records.ts";
export async function taskRequesterOrganization(user:ReturnType<typeof actor>,task:Record<string,any>){if(!sql)return null;const source=await sql`SELECT created_by FROM nexusflow.records WHERE id=${String(task.id)} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`,requesterId=String(source[0]?.created_by||"");if(!requesterId)return null;const account=await sql`SELECT org_id FROM nexusflow.users WHERE id=${requesterId} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;return account[0]?.org_id?String(account[0].org_id):null;}
export async function hasDispatchForTask(user:ReturnType<typeof actor>,taskId:string){if(!sql)return false;const rows=await sql`SELECT id FROM nexusflow.records WHERE kind='dispatch' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'task_id'=${taskId} AND data->>'status' NOT IN ('rejected','cancelled') LIMIT 1`;return rows.length>0;}

export async function taskTargetOrganizations(user:User,task:Record<string,any>){const assignments=await db()`SELECT data FROM nexusflow.records WHERE kind='task_assignments' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'task_id'=${String(task.id)} AND data->>'status' NOT IN ('cancelled','rejected')`;const ids=assignments.length?[...new Set(assignments.map((r:any)=>String(r.data.user_id)))]:[String(task.owner_id),...(Array.isArray(task.member_ids)?task.member_ids.map(String):[])],users=await activeUsers(user,ids),orgs=[...new Set(users.map(u=>String(u.org_id||"")).filter(Boolean))];return orgs.length?orgs:task.org_id?[String(task.org_id)]:[];}
