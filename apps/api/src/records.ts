import { guardPatch as guardTasksPatch,validateTasksCreate,validateTaskAssignmentsCreate,lockAssignmentCreate,createTaskAssignments,syncAssignmentMembers } from "./domains/tasks/validation.ts";
import { guardPatch as guardDispatchPatch,validateDispatchCreate,lockDispatchCreate } from "./domains/dispatch/validation.ts";
import { guardPatch as guardProjectsPatch,validateProjectsCreate,validateProjectsUpdate,validateVisibilityGrantsCreate } from "./domains/projects/validation.ts";
import { guardPatch as guardOrgPatch,validateOrgsCreate,validateOrgParent } from "./domains/org/validation.ts";
import { guardPatch as guardPeoplePatch,validatePeopleCreate } from "./domains/people/validation.ts";
import { guardPatch as guardConfigPatch,validateConfigCreate } from "./domains/config/validation.ts";
import { guardPatch as guardFilesPatch } from "./domains/files/validation.ts";
import { guardPatch as guardApprovalsPatch } from "./domains/approvals/validation.ts";
import { guardPatch as guardAdminPatch } from "./domains/admin/validation.ts";
import { addAudit } from "./shared/audit.ts";
import { z } from "zod";
import { sql } from "./db.ts";
import { canReadRecord,canWriteRecord,type User } from "./permissions.ts";
export const collections=["orgs","people","projects","tasks","dispatch","approvals","load","conflicts","files","inbox","tools","reports","config","admin","mentions","milestones","worklogs","visibility_grants","seed","invitations","registrations","config_versions","task_assignments"] as const;
export type Collection=typeof collections[number];
const uuid=()=>crypto.randomUUID();
import { orgsSchema } from "./domains/org/schema.ts";
import { peopleSchema } from "./domains/people/schema.ts";
import { projectsSchema } from "./domains/projects/schema.ts";
import { tasksSchema } from "./domains/tasks/schema.ts";
import { dispatchSchema } from "./domains/dispatch/schema.ts";
import { approvalsSchema } from "./domains/approvals/schema.ts";
import { filesSchema } from "./domains/files/schema.ts";
import { visibility_grantsSchema } from "./domains/projects/schema.ts";
import { configSchema } from "./domains/config/schema.ts";
import { task_assignmentsSchema } from "./domains/tasks/schema.ts";
const schemas:Partial<Record<Collection,z.ZodTypeAny>>={orgs:orgsSchema,people:peopleSchema,projects:projectsSchema,tasks:tasksSchema,dispatch:dispatchSchema,approvals:approvalsSchema,files:filesSchema,visibility_grants:visibility_grantsSchema,config:configSchema,task_assignments:task_assignmentsSchema};
function db(){if(!sql)throw new Error("DATABASE_URL required");return sql;}
export { taskTargetOrganizations } from "./domains/tasks/service.ts";
export async function listRecords(user:User,kind:Collection):Promise<Array<Record<string,any>>> {
 const rows=await db()`SELECT id,tenant_id,created_by,data,created_at,updated_at FROM nexusflow.records WHERE kind=${kind} AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) ORDER BY created_at DESC`;
 const visible=[];for(const r of rows){const row={id:r.id,tenant_id:r.tenant_id,created_by:r.created_by,data:r.data as Record<string,unknown>};if(await canReadRecord(user,kind,row)){const data={...row.data};if(kind==="invitations")delete data.token_hash;visible.push({...data,id:r.id,created_at:r.created_at,updated_at:r.updated_at});}}return visible;
}
export async function getRecord(user:User,kind:Collection,id:string):Promise<Record<string,any>|null> {
 const rows=await db()`SELECT id,tenant_id,created_by,data,created_at,updated_at FROM nexusflow.records WHERE id=${id} AND kind=${kind} AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id})`;const r=rows[0];if(!r)return null;
 const row={id:r.id,tenant_id:r.tenant_id,created_by:r.created_by,data:r.data as Record<string,unknown>};if(!await canReadRecord(user,kind,row))return null;const data={...row.data};if(kind==="invitations")delete data.token_hash;return {...data,id:r.id,created_at:r.created_at,updated_at:r.updated_at};
}
export async function createRecord(user:User,kind:Collection,input:Record<string,unknown>) {
 if(kind==="orgs"&&["demo_seed","department_approver_id","center_approver_id"].some(k=>k in input))throw new Error("approval identity fields are managed by account roles");
 if("id" in input||"created_at" in input||"updated_at" in input)throw new Error("server-managed fields cannot be supplied");
 const parsed=schemas[kind]?.safeParse(input);if(parsed&&!parsed.success)throw new Error("invalid record: "+parsed.error.issues.map(x=>`${x.path.join(".")}: ${x.message}`).join("; "));
 const data={...(parsed?.data||input)} as Record<string,unknown>;
 if(kind==="orgs")await validateOrgsCreate(user,data);
 if(kind==="people")await validatePeopleCreate(user,data);
 if(kind==="projects")await validateProjectsCreate(user,data);
 if(kind==="tasks")await validateTasksCreate(user,data);
 if(kind==="config")await validateConfigCreate(user,data);
 if(kind==="task_assignments")await validateTaskAssignmentsCreate(user,data);
 if(kind==="dispatch")await validateDispatchCreate(user,data);
 if(kind==="visibility_grants")await validateVisibilityGrantsCreate(user,data);
 const row={tenant_id:user.tenant_id,created_by:user.id,data};if(!await canWriteRecord(user,kind,row,"create"))throw new Error("forbidden");
 if(kind==="approvals"||kind==="inbox"||kind==="conflicts"||kind==="worklogs"||kind==="load"||kind==="seed"||kind==="config_versions"||kind==="mentions")throw new Error("records of this type are created by domain actions");
 if(kind==="orgs"&&!['super_admin','center_director'].includes(user.role))throw new Error("organization management permission required");
 const id=uuid();await db().begin(async tx=>{await lockAssignmentCreate(tx,user,kind,id,data);await lockDispatchCreate(tx,user,kind,id,data);if(kind==="orgs")await validateOrgParent(tx,user.tenant_id,id,data.parent_id,data.type);await tx`INSERT INTO nexusflow.records(id,kind,tenant_id,created_by,data) VALUES(${id},${kind},${user.tenant_id},${user.id},${tx.json(data as any)})`;await createTaskAssignments(tx,user,kind,id,data);await syncAssignmentMembers(tx,user,kind,id,data);await addAudit(tx,user,kind+".create",kind,id,{after:data});});return getRecord(user,kind,id);
}
export async function updateRecord(user:User,kind:Collection,id:string,patch:Record<string,unknown>) {
 if(kind==="orgs"&&["demo_seed","department_approver_id","center_approver_id"].some(k=>k in patch))throw new Error("approval identity fields are managed by account roles");
 if("id" in patch||"created_at" in patch||"updated_at" in patch||"created_by" in patch||"tenant_id" in patch)throw new Error("server-managed fields cannot be changed");
 guardTasksPatch(user,kind,patch);
 guardConfigPatch(user,kind,patch);
 guardAdminPatch(user,kind,patch);
 guardPeoplePatch(user,kind,patch);
 guardOrgPatch(user,kind,patch);
 guardDispatchPatch(user,kind,patch);
 guardApprovalsPatch(user,kind,patch);
 guardFilesPatch(user,kind,patch);
 guardProjectsPatch(user,kind,patch);
 const current=await getRaw(kind,id,user);if(!current)return null;if(!await canWriteRecord(user,kind,current,"update"))throw new Error("forbidden");
 const next={...current.data,...patch};if(kind==="config"&&current.data.status==="published"&&("value" in patch||"key" in patch))return createRecord(user,"config",{...next,status:"draft",version:Number(current.data.version||0)});if(kind==="config"&&current.data.status!=="draft")throw new Error("only configuration drafts can be edited");const validated=kind==="tasks"?{...next,status:"draft"}:kind==="projects"?{...next,status:"planning"}:kind==="config"?{...next,status:"draft"}:next;const parsed=schemas[kind]?.safeParse(validated);if(parsed&&!parsed.success)throw new Error("invalid record: "+parsed.error.issues.map(x=>x.message).join("; "));
 if(kind==="projects")await validateProjectsUpdate(user,next);
 await db().begin(async tx=>{if(kind==="orgs"&&("parent_id" in patch||"type" in patch)){await tx`LOCK TABLE nexusflow.records IN SHARE ROW EXCLUSIVE MODE`;await validateOrgParent(tx,current.tenant_id,id,next.parent_id,next.type);}const locked=await tx`SELECT data,updated_at FROM nexusflow.records WHERE id=${id} AND kind=${kind} AND tenant_id IS NOT DISTINCT FROM ${current.tenant_id} FOR UPDATE`;if(!locked[0]||new Date(locked[0].updated_at).valueOf()!==new Date(current.updated_at).valueOf())throw new Error("record changed; retry the update");await tx`UPDATE nexusflow.records SET data=${tx.json(next as any)},updated_at=now() WHERE id=${id} AND kind=${kind} AND tenant_id IS NOT DISTINCT FROM ${current.tenant_id}`;await addAudit(tx,{...user,tenant_id:current.tenant_id},kind+".update",kind,id,{before:current.data,after:next});});return getRecord(user,kind,id);
}
async function getRaw(kind:Collection,id:string,user:User){const r=(await db()`SELECT id,tenant_id,created_by,data,updated_at FROM nexusflow.records WHERE id=${id} AND kind=${kind} AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id})`)[0];return r?{id:r.id,tenant_id:r.tenant_id,created_by:r.created_by,data:r.data as Record<string,unknown>,updated_at:r.updated_at}:null;}
export async function deleteRecord(user:User,kind:Collection,id:string){if(["files","tasks","task_assignments","projects","orgs","people","invitations","visibility_grants"].includes(kind))return false;const r=await getRaw(kind,id,user);if(!r||kind==="config"&&r.data.status!=="draft"||!await canWriteRecord(user,kind,r,"delete"))return false;const refs=kind==="dispatch"?await db()`SELECT 1 FROM nexusflow.records WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND (kind='approvals' AND data->>'dispatch_id'=${id} OR kind='inbox' AND data->>'source_id'=${id}) LIMIT 1`:kind==="approvals"?await db()`SELECT 1 FROM nexusflow.records WHERE kind='inbox' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'source_id'=${id} LIMIT 1`:[];if(refs.length)return false;return db().begin(async tx=>{const deleted=kind==="config"?await tx`DELETE FROM nexusflow.records WHERE id=${id} AND kind=${kind} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'status'='draft' RETURNING id`:await tx`DELETE FROM nexusflow.records WHERE id=${id} AND kind=${kind} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} RETURNING id`;if(!deleted.length)return false;await addAudit(tx,{...user,tenant_id:r.tenant_id},kind+".delete",kind,id,{before:r.data});return true;});}
export async function insertRecord(tx:any,user:User,kind:Collection|"storage_cleanup"|"role_delegations",data:Record<string,unknown>) {const id=uuid();await tx`INSERT INTO nexusflow.records(id,kind,tenant_id,created_by,data) VALUES(${id},${kind},${user.tenant_id},${user.id},${tx.json(data)})`;return id;}
