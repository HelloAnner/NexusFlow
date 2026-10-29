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
 return sql.begin(async tx=>{
  // ponytail: 部门删除低频，短暂表锁保护 JSON 引用检查；高吞吐时迁移为外键关系。
  await tx`LOCK TABLE nexusflow.records,nexusflow.users IN EXCLUSIVE MODE`;
  const children=await tx`SELECT 1 FROM nexusflow.records WHERE kind='orgs' AND data->>'parent_id'=${id} LIMIT 1`;
  const members=await tx`SELECT 1 FROM nexusflow.users WHERE org_id=${id} OR ${id}=ANY(org_ids) LIMIT 1`;
  const related=await tx`SELECT 1 FROM nexusflow.records WHERE id<>${id} AND (data->>'org_id'=${id} OR data->'org_ids' ? ${id} OR data->>'target_org_id'=${id} OR data->'target_org_ids' ? ${id}) LIMIT 1`;
  const refs={children:children.length,members:members.length,related:related.length};
  if(Object.values(refs).some(Boolean))return c.json({error:"department still referenced",refs},409);
  const rows=await tx`DELETE FROM nexusflow.records WHERE id=${id} AND kind='orgs' AND (${user.role==='super_admin'} OR tenant_id IS NOT DISTINCT FROM ${user.tenant_id}) RETURNING id`;
  if(!rows.length)return c.json({error:"department changed; retry"},409);
  await addAudit(tx,user,"orgs.delete","orgs",id,{before:org});
  return c.json({ok:true});
 });
});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["orgs"]);}
