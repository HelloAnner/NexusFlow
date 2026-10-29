import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor, featureDenied } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { getRecord } from "../../records.ts";
import { addAudit } from "../../shared/audit.ts";
import { orgTree } from "./service.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/org/tree",async c=>orgTree(actor(c)));
app.get("/api/orgs/tree",async c=>orgTree(actor(c)));
app.delete("/api/orgs/:id",async c=>{
 const user=actor(c);
 if(!["super_admin","center_director"].includes(user.role)||featureDenied(user,"org","manage")||!sql)return c.json({error:"forbidden"},403);
 const id=c.req.param("id"),org=await getRecord(user,"orgs",id);
 if(!org)return c.json({error:"not found"},404);
 const [children,members,projects,tasks]=await Promise.all([
  sql`SELECT 1 FROM nexusflow.records WHERE kind='orgs' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) AND data->>'parent_id'=${id} LIMIT 1`,
  sql`SELECT 1 FROM nexusflow.users WHERE (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) AND (org_id=${id} OR ${id}=ANY(org_ids)) LIMIT 1`,
  sql`SELECT 1 FROM nexusflow.records WHERE kind='projects' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) AND data->>'org_id'=${id} LIMIT 1`,
  sql`SELECT 1 FROM nexusflow.records WHERE kind='tasks' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) AND data->>'org_id'=${id} LIMIT 1`,
 ]);
 const refs={children:children.length,members:members.length,projects:projects.length,tasks:tasks.length};
 if(Object.values(refs).some(Boolean))return c.json({error:"department still referenced",refs},409);
 const deleted=await sql.begin(async tx=>{
  const rows=await tx`DELETE FROM nexusflow.records WHERE id=${id} AND kind='orgs' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) RETURNING id`;
  if(!rows.length)return false;
  await addAudit(tx,user,"orgs.delete","orgs",id,{before:org,reason:String(org.name||"")});
  return true;
 });
 if(!deleted)return c.json({error:"department changed; retry"},409);
 return c.json({ok:true});
});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["orgs"]);}
