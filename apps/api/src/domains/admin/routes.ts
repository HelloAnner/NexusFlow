import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { canManageOrganization,canManage,actor,featureDenied } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { insertRecord,getRecord,createRecord } from "../../records.ts";
import { addAudit } from "../../shared/audit.ts";
import { hashText } from "../../shared/hash.ts";
import { revokeUserSessions } from "../../auth.ts";
import { roles as allRoles,dutyTags,managementLevels,professionalLevels,projectRoles } from "../../../../../packages/shared/src/index.ts";
import { preflight } from "./preflight.ts";
import { userProfilePatch } from "./validation.ts";

const inList=(list:readonly {value:string}[],value:unknown)=>typeof value==="string"&&list.some(x=>x.value===value);
const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(new Date(`${value}T00:00:00.000Z`).valueOf());
const today=()=>new Date().toISOString().slice(0,10);

export function registerRoutes(app:ApiApp){
app.get("/api/admin/preflight",async c=>c.json(await preflight(actor(c))));

app.get("/api/admin/users",async c=>{
 const user=actor(c);
 if(!canManage(user)||featureDenied(user,"people","manage"))return c.json({error:"forbidden"},403);
 if(!sql)return c.json({items:[]});
 const rows=await sql`SELECT id,username,display_name,role,tenant_id,org_id,(CASE WHEN cardinality(org_ids)=0 AND org_id IS NOT NULL THEN ARRAY[org_id]::text[] ELSE org_ids END) AS org_ids,status,created_at,updated_at FROM nexusflow.users WHERE (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) AND (${['super_admin','center_director'].includes(user.role)} OR org_id IS NOT DISTINCT FROM ${user.org_id} OR ${user.org_id} = ANY(org_ids)) ORDER BY created_at`;
 const profiles=await sql`SELECT id,data FROM nexusflow.records WHERE kind='people' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id})`;
 const byUser=new Map<string,Record<string,any>>();
 for(const row of profiles){const data=row.data as Record<string,any>;if(typeof data.user_id==="string")byUser.set(data.user_id,{person_id:row.id,...data});}
 const items=rows.map((row:any)=>{
  const person=byUser.get(String(row.id))??{};
  return {...row,
   person_id:person.person_id??null,
   title:person.title??null,
   employee_no:person.employee_no??null,
   management_level:person.management_level??null,
   professional_level:person.professional_level??null,
   duties:Array.isArray(person.duties)?person.duties:[],
   skills:Array.isArray(person.skills)?person.skills:[],
   studio_ids:Array.isArray(person.studio_ids)?person.studio_ids:[],
   work_status:typeof person.status==="string"?person.status:"active",
   dispatchable:person.dispatchable!==false,
   daily_standard_hours:Number(person.daily_standard_hours??8),
  };
 });
 return c.json({items});
});

app.put("/api/admin/users/:id/delegations",async c=>{const user=actor(c);if(!["super_admin","center_director"].includes(user.role)||featureDenied(user,"people","manage")||!sql)return c.json({error:"forbidden"},403);const body:any=await c.req.json().catch(()=>({})),orgIds=[...new Set<string>(Array.isArray(body.org_ids)?body.org_ids.map(String):[])];if(!orgIds.length||orgIds.length>50||!String(body.reason||"").trim())return c.json({error:"org_ids and audit reason required"},400);for(const orgId of orgIds)if(!await getRecord(user,"orgs",orgId))return c.json({error:"organization not found"},404);const result=await sql.begin(async tx=>{const targets=await tx`SELECT id,role FROM nexusflow.users WHERE id=${c.req.param("id")} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;if(!targets[0])return false;if(!["center_deputy","department_deputy"].includes(targets[0].role))throw new Error("delegations only apply to deputy roles");await tx`UPDATE nexusflow.records SET data=data||${tx.json({status:"revoked",revoked_at:new Date().toISOString(),revoked_by:user.id} as any)},updated_at=now() WHERE kind='role_delegations' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'user_id'=${String(targets[0].id)} AND data->>'status'='active'`;await insertRecord(tx,user,"role_delegations",{user_id:String(targets[0].id),org_ids:orgIds,status:"active",reason:body.reason});await addAudit(tx,user,"admin.user_delegations","user",String(targets[0].id),{org_ids:orgIds,reason:body.reason});return true;});return result?c.json({ok:true,org_ids:orgIds}):c.json({error:"not found"},404);});

app.patch("/api/admin/users/:id/binding",async c=>{const user=actor(c);if(!["super_admin","center_director"].includes(user.role)||featureDenied(user,"people","manage")||!sql)return c.json({error:"forbidden"},403);const body=await c.req.json().catch(()=>({})),roles:readonly string[]=allRoles.filter(role=>role!=="super_admin");if(!String(body.reason||"").trim()||!roles.includes(String(body.role)))return c.json({error:"role and audit reason required"},400);const orgId=body.org_id?String(body.org_id):null;if(orgId&&!await getRecord(user,"orgs",orgId))return c.json({error:"organization not found"},404);const result=await sql.begin(async tx=>{const rows=await tx`SELECT id,role,org_id,org_ids FROM nexusflow.users WHERE id=${c.req.param("id")} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;if(!rows[0])return null;if(rows[0].role==="super_admin"&&user.role!=="super_admin")throw new Error("only a super administrator may change a super administrator");if(["super_admin","center_director"].includes(String(body.role))&&user.role!=="super_admin")throw new Error("only a super administrator may grant that role");const orgIds=orgId?[orgId,...((rows[0].org_ids as string[]|null)??[]).filter(id=>id!==orgId)]:(rows[0].org_ids as string[]|null)??[];await tx`UPDATE nexusflow.users SET role=${body.role},org_id=${orgId},org_ids=${orgIds},updated_at=now() WHERE id=${rows[0].id}`;await tx`UPDATE nexusflow.records SET data=data||${tx.json({org_id:orgId,org_ids:orgIds} as any)},updated_at=now() WHERE kind='people' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'user_id'=${String(rows[0].id)}`;await addAudit(tx,user,"admin.user_binding","user",String(rows[0].id),{role:body.role,org_id:orgId,reason:body.reason});return {id:String(rows[0].id),changed:rows[0].role!==body.role||rows[0].org_id!==orgId};});if(!result)return c.json({error:"not found"},404);if(result.changed)await revokeUserSessions(result.id);return c.json({ok:true});});

app.patch("/api/admin/users/:id/profile",async c=>{
 const user=actor(c);
 if(!canManage(user)||featureDenied(user,"people","manage")||!sql)return c.json({error:"forbidden"},403);
 const body=userProfilePatch.parse(await c.req.json().catch(()=>null));
 const studioIds=body.studio_ids===undefined?undefined:[...new Set(body.studio_ids)];
 const elevated=["super_admin","center_director"].includes(user.role);
 const visible=await sql`SELECT id,display_name,role,org_id,org_ids,tenant_id,updated_at FROM nexusflow.users WHERE id=${c.req.param("id")} AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) AND (${elevated} OR org_id IS NOT DISTINCT FROM ${user.org_id} OR ${user.org_id} = ANY(org_ids)) LIMIT 1`;
 const target=visible[0];
 if(!target)return c.json({error:"not found"},404);
 if(body.management_level&&!inList(managementLevels,body.management_level))return c.json({error:"invalid management level"},400);
 if(body.professional_level&&!inList(professionalLevels,body.professional_level))return c.json({error:"invalid professional level"},400);
 for(const duty of body.duties??[])if(!inList(dutyTags,duty))return c.json({error:"invalid duty tag"},400);
 for(const studioId of studioIds??[]){const studio=await getRecord(user,"orgs",studioId);if(!studio||studio.type!=="studio")return c.json({error:"studio organization required"},400);}
 if(body.employee_no){
  const duplicate=await sql`SELECT 1 FROM nexusflow.records WHERE kind='people' AND tenant_id IS NOT DISTINCT FROM ${target.tenant_id} AND data->>'employee_no'=${body.employee_no} AND data->>'user_id' IS DISTINCT FROM ${String(target.id)} LIMIT 1`;
  if(duplicate.length)return c.json({error:"employee number already exists"},409);
 }
 const previousIds=(target.org_ids as string[]|null)?.length?target.org_ids as string[]:target.org_id?[String(target.org_id)]:[];
 const orgIds=body.org_ids===undefined?previousIds:[...new Set(body.org_ids)];
 for(const orgId of orgIds)if(!previousIds.includes(orgId)&&(!await getRecord(user,"orgs",orgId)||!elevated&&!await canManageOrganization(user,orgId)))return c.json({error:"organization unavailable"},404);
 if(!elevated)for(const id of previousIds.filter(id=>!orgIds.includes(id)))if(!await canManageOrganization(user,id))return c.json({error:"forbidden"},403);
 const result=await sql.begin(async tx=>{
  if(body.org_ids!==undefined&&orgIds.length){
   const found=await tx`SELECT id FROM nexusflow.records WHERE kind='orgs' AND tenant_id IS NOT DISTINCT FROM ${target.tenant_id} AND id = ANY(${orgIds}::text[]) FOR KEY SHARE`;
   if(found.length!==orgIds.length)throw new Error("organization unavailable");
  }
  if(studioIds!==undefined&&studioIds.length){
   const studios=await tx`SELECT id,data FROM nexusflow.records WHERE kind='orgs' AND tenant_id IS NOT DISTINCT FROM ${target.tenant_id} AND id = ANY(${studioIds}::text[]) FOR KEY SHARE`;
   if(studios.length!==studioIds.length||studios.some((s:any)=>String((s.data as any).type||"")!=="studio"))throw new Error("studio organization required");
  }
  const rows=await tx`SELECT id,display_name,role,org_id,org_ids,tenant_id,updated_at FROM nexusflow.users WHERE id=${target.id} FOR UPDATE`;
  const row=rows[0];
  if(!row)return null;
  const expected=body.updated_at??target.updated_at;
  if((expected&&new Date(row.updated_at).valueOf()!==new Date(expected).valueOf())||JSON.stringify(row.org_ids??[])!==JSON.stringify(target.org_ids??[]))throw new Error("profile changed; reload before saving");
  if(row.role==="super_admin"&&user.role!=="super_admin")return null;
  const primary=body.org_ids===undefined?row.org_id:row.org_id&&orgIds.includes(String(row.org_id))?String(row.org_id):orgIds[0]??null;
  const nextName=body.display_name??String(row.display_name||"User");
  const profiles=await tx`SELECT id,data FROM nexusflow.records WHERE kind='people' AND tenant_id IS NOT DISTINCT FROM ${row.tenant_id} AND data->>'user_id'=${String(row.id)} FOR UPDATE`;
  const before=profiles[0]?.data as Record<string,any>|undefined;
  const personPatch:Record<string,unknown>={name:nextName,org_id:primary,org_ids:orgIds};
  if(body.employee_no!==undefined)personPatch.employee_no=body.employee_no;
  if(body.management_level!==undefined)personPatch.management_level=body.management_level;
  if(body.professional_level!==undefined)personPatch.professional_level=body.professional_level;
  if(body.duties!==undefined)personPatch.duties=[...new Set(body.duties)];
  if(body.skills!==undefined)personPatch.skills=[...new Set(body.skills)];
  if(studioIds!==undefined)personPatch.studio_ids=studioIds;
  if(body.work_status!==undefined)personPatch.status=body.work_status;
  if(body.daily_standard_hours!==undefined)personPatch.daily_standard_hours=body.daily_standard_hours;
  if(body.dispatchable!==undefined)personPatch.dispatchable=body.dispatchable;
  await tx`UPDATE nexusflow.users SET display_name=${nextName},org_id=${primary},org_ids=${orgIds},updated_at=now() WHERE id=${row.id}`;
  if(profiles[0]){
   await tx`UPDATE nexusflow.records SET data=data||${tx.json(personPatch as any)},updated_at=now() WHERE id=${profiles[0].id} AND kind='people'`;
  }else{
   await insertRecord(tx,{...user,tenant_id:row.tenant_id},"people",{name:nextName,user_id:String(row.id),org_id:primary,org_ids:orgIds,status:"active",daily_standard_hours:8,skills:[],...personPatch});
  }
  await addAudit(tx,{...user,tenant_id:row.tenant_id},"admin.user_profile","user",String(row.id),{before:{display_name:row.display_name,org_ids:previousIds,person:before??null},after:{display_name:nextName,org_ids:orgIds,person:personPatch}});
  return {id:String(row.id),display_name:nextName,org_id:primary,org_ids:orgIds,person_id:profiles[0]?.id??null,person:personPatch};
 });
 return result?c.json({ok:true,user:result}):c.json({error:"not found"},404);
});

app.get("/api/admin/users/:id/projects",async c=>{
 const user=actor(c);
 if(!canManage(user)||featureDenied(user,"people","manage")||!sql)return c.json({error:"forbidden"},403);
 const userId=c.req.param("id");
 const projects=await sql`SELECT id,data FROM nexusflow.records WHERE kind='projects' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id})`;
 const items=projects.flatMap((row:any)=>{
  const data=row.data as Record<string,any>,members=data.members&&typeof data.members==="object"?data.members as Record<string,any>:{};
  const listed=Array.isArray(data.member_ids)&&data.member_ids.includes(userId),membership=members[userId];
  if(!listed&&!membership)return [];
  return [{project_id:String(row.id),project_name:String(data.name||""),org_id:data.org_id??null,member:listed,membership:membership??null}];
 });
 return c.json({items});
});

app.put("/api/admin/users/:id/projects/:projectId",async c=>{
 const user=actor(c);
 if(!canManage(user)||featureDenied(user,"people","manage")||!sql)return c.json({error:"forbidden"},403);
 const body=await c.req.json().catch(()=>({}));
 const projectRole=String(body.project_role||"participant");
 if(!projectRoles.some(x=>x.value===projectRole))return c.json({error:"invalid project role"},400);
 const responsibility=String(body.responsibility||"").trim().slice(0,200);
 const start=body.start_date?String(body.start_date):today(),end=body.end_date?String(body.end_date):null;
 if(!isDate(start)||(end!==null&&!isDate(end))||(end!==null&&end<start))return c.json({error:"valid project membership dates required"},400);
 const userId=c.req.param("id"),projectId=c.req.param("projectId");
 const target=(await sql`SELECT id FROM nexusflow.users WHERE id=${userId} AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) LIMIT 1`)[0];
 if(!target)return c.json({error:"user not found"},404);
 const result=await sql.begin(async tx=>{
  const rows=await tx`SELECT id,tenant_id,data FROM nexusflow.records WHERE id=${projectId} AND kind='projects' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) FOR UPDATE`;
  const project=rows[0];if(!project)return null;
  if(!["super_admin","center_director"].includes(user.role)&&!await canManageOrganization(user,String((project.data as any).org_id||"")))throw new Error("forbidden: project organization outside your scope");
  const data=project.data as Record<string,any>;
  const memberIds=[...new Set([...(Array.isArray(data.member_ids)?data.member_ids.map(String):[]),userId])];
  const membership={project_role:projectRole,responsibility,start_date:start,end_date:end,active:true,updated_by:user.id,updated_at:new Date().toISOString()};
  const members={...(data.members&&typeof data.members==="object"?data.members:{}),[userId]:membership};
  await tx`UPDATE nexusflow.records SET data=data||${tx.json({member_ids:memberIds,members} as any)},updated_at=now() WHERE id=${projectId} AND kind='projects'`;
  await addAudit(tx,{...user,tenant_id:project.tenant_id},"admin.user_project","project",projectId,{user_id:userId,project_role:projectRole,responsibility,start_date:start,end_date:end});
  return {ok:true,project_id:projectId,user_id:userId,membership};
 });
 return result?c.json(result):c.json({error:"not found"},404);
});

app.delete("/api/admin/users/:id/projects/:projectId",async c=>{
 const user=actor(c);
 if(!canManage(user)||featureDenied(user,"people","manage")||!sql)return c.json({error:"forbidden"},403);
 const userId=c.req.param("id"),projectId=c.req.param("projectId");
 const result=await sql.begin(async tx=>{
  const rows=await tx`SELECT id,tenant_id,data FROM nexusflow.records WHERE id=${projectId} AND kind='projects' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) FOR UPDATE`;
  const project=rows[0];if(!project)return null;
  if(!["super_admin","center_director"].includes(user.role)&&!await canManageOrganization(user,String((project.data as any).org_id||"")))throw new Error("forbidden: project organization outside your scope");
  const data=project.data as Record<string,any>;
  const members={...(data.members&&typeof data.members==="object"?data.members:{})};
  const existing=members[userId]??{};
  members[userId]={...existing,active:false,end_date:existing.end_date??today(),updated_by:user.id,updated_at:new Date().toISOString()};
  const memberIds=(Array.isArray(data.member_ids)?data.member_ids.map(String):[]).filter(id=>id!==userId);
  await tx`UPDATE nexusflow.records SET data=data||${tx.json({member_ids:memberIds,members} as any)},updated_at=now() WHERE id=${projectId} AND kind='projects'`;
  await addAudit(tx,{...user,tenant_id:project.tenant_id},"admin.user_project_remove","project",projectId,{user_id:userId});
  return {ok:true,project_id:projectId,user_id:userId};
 });
 return result?c.json(result):c.json({error:"not found"},404);
});

app.patch("/api/admin/users/:id/status",async c=>{const user=actor(c);if(!["super_admin","center_director"].includes(user.role)||featureDenied(user,"people","manage")||!sql)return c.json({error:"forbidden"},403);const body=await c.req.json().catch(()=>({}));if(!["active","disabled","locked"].includes(body.status)||!String(body.reason||"").trim())return c.json({error:"valid status and audit reason required"},400);const id=await sql.begin(async tx=>{const rows=await tx`SELECT id,role FROM nexusflow.users WHERE id=${c.req.param("id")} AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) FOR UPDATE`;if(!rows[0])return null;if(rows[0].role==="super_admin"&&user.role!=="super_admin")throw new Error("only a super administrator may change a super administrator");await tx`UPDATE nexusflow.users SET status=${body.status},updated_at=now() WHERE id=${rows[0].id}`;await addAudit(tx,user,"admin.user_status","user",String(rows[0].id),{status:body.status,reason:body.reason});return String(rows[0].id);});if(!id)return c.json({error:"not found"},404);if(body.status!=="active")await revokeUserSessions(id);return c.json({ok:true});});

app.post("/api/invitations/:id/revoke",async c=>{const user=actor(c);if(!canManage(user))return c.json({error:"forbidden"},403);if(!sql)return c.json({error:"DATABASE_URL required"},503);const visible=await getRecord(user,"invitations",c.req.param("id"));if(!visible)return c.json({error:"not found"},404);const result=await sql.begin(async tx=>{const rows=await tx`SELECT id,data FROM nexusflow.records WHERE id=${c.req.param("id")} AND kind='invitations' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;if(!rows[0])return null;if(String((rows[0].data as any).org_id||"")!==String(visible.org_id||""))throw new Error("invitation scope changed; retry");if((rows[0].data as any).status!=="active")throw new Error("only active invitations can be revoked");await tx`UPDATE nexusflow.records SET data=data||${tx.json({status:"revoked",revoked_at:new Date().toISOString(),revoked_by:user.id} as any)},updated_at=now() WHERE id=${rows[0].id} AND kind='invitations'`;await addAudit(tx,user,"invitation.revoke","invitations",String(rows[0].id));return {ok:true};});return result?c.json(result):c.json({error:"not found"},404);});

app.post("/api/invitations",async c=>{const user=actor(c);if(!canManage(user)||featureDenied(user,"people","manage"))return c.json({error:"forbidden"},403);const body=await c.req.json().catch(()=>({}));const elevated=["center_director","super_admin"].includes(user.role);const roles=elevated?["member","project_lead","department_deputy","department_director","center_deputy"]:["member","project_lead"];const role=String(body.role||"member"),org_id=String(body.org_id||user.org_id||"");if(!roles.includes(role)||!org_id||(!elevated&&!await canManageOrganization(user,org_id)))return c.json({error:"invalid invite role or organization scope"},400);const expires_at=body.expires_at?new Date(String(body.expires_at)):new Date(Date.now()+7*86400000);if(!Number.isFinite(expires_at.valueOf())||expires_at<=new Date()||expires_at.getTime()>Date.now()+30*86400000)return c.json({error:"invitation expiry must be within 30 days"},400);const token=crypto.randomUUID()+crypto.randomUUID(),token_hash=await hashText(token);const invitation=await createRecord(user,"invitations",{role,org_id,token_hash,status:"active",expires_at:expires_at.toISOString(),created_by:user.id});return c.json({invitation,token},201);});

app.get("/api/admin/audit",async c=>{if((!canManage(actor(c))&&!['super_admin','center_director'].includes(actor(c).role))||featureDenied(actor(c),"audit","view"))return c.json({error:"forbidden"},403);if(!sql)return c.json({items:[]});const user=actor(c);const items=await sql`SELECT id,actor,action,object_kind,object_id,data,created_at FROM nexusflow.audit WHERE (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) AND (${['super_admin','center_director'].includes(user.role)} OR actor IN (SELECT id FROM nexusflow.users WHERE org_id IS NOT DISTINCT FROM ${user.org_id})) ORDER BY created_at DESC LIMIT 500`;return c.json({items});});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["admin", "invitations", "registrations"]);}
