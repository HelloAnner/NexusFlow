import type { ApiApp } from "../../shared/http.ts";
import { actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { addAudit } from "../../shared/audit.ts";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 文件身份映射独立于 SSO 字段，不修改登录方式或用户权限。
export function registerPortalFileLinks(app:ApiApp){
 app.get("/api/admin/portal-file-links",async c=>{
  if(actor(c).role!=="super_admin")return c.json({error:"forbidden"},403);
  if(!sql)return c.json({error:"database unavailable"},503);
  return c.json({items:await sql`SELECT portal_tenant_id,portal_user_id,local_user_id,local_tenant_id,status,reason,updated_at FROM nexusflow.portal_file_links ORDER BY updated_at DESC`});
 });
 app.put("/api/admin/portal-file-links",async c=>{
  const user=actor(c);if(user.role!=="super_admin")return c.json({error:"forbidden"},403);
  const b=await c.req.json().catch(()=>null);
  if(!b||!uuid.test(b.portal_user_id??"")||!uuid.test(b.portal_tenant_id??"")||!String(b.reason??"").trim()||!["active","revoked"].includes(b.status))return c.json({error:"invalid mapping or reason required"},400);
  if(!sql)return c.json({error:"database unavailable"},503);
  const result=await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(hashtext(${b.portal_tenant_id+":"+b.portal_user_id}))`;
   const old=(await tx`SELECT * FROM nexusflow.portal_file_links WHERE portal_tenant_id=${b.portal_tenant_id} AND portal_user_id=${b.portal_user_id} FOR UPDATE`)[0];
   if(b.status==="revoked"){
    if(!old)return {error:"not found",status:404};
    await tx`UPDATE nexusflow.portal_file_links SET status='revoked',reason=${b.reason},updated_by=${user.id},updated_at=now() WHERE portal_tenant_id=${b.portal_tenant_id} AND portal_user_id=${b.portal_user_id}`;
   }else{
    if(typeof b.local_user_id!=="string")return {error:"local user required",status:400};
    const local=(await tx`SELECT id,tenant_id,status FROM nexusflow.users WHERE id=${b.local_user_id} FOR UPDATE`)[0];
    if(!local||local.status!=="active"||!local.tenant_id)return {error:"local user unavailable",status:404};
    if(old?.status==="active"&&old.local_user_id!==local.id)return {error:"mapping already exists",status:409};
    await tx`INSERT INTO nexusflow.portal_file_links(portal_tenant_id,portal_user_id,local_user_id,local_tenant_id,status,reason,updated_by)
     VALUES(${b.portal_tenant_id},${b.portal_user_id},${local.id},${local.tenant_id},'active',${b.reason},${user.id})
     ON CONFLICT(portal_tenant_id,portal_user_id) DO UPDATE SET local_user_id=excluded.local_user_id,local_tenant_id=excluded.local_tenant_id,status='active',reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now()`;
   }
   await addAudit(tx,user,"portal.file-link."+b.status,"portal_file_links",b.portal_tenant_id+":"+b.portal_user_id,{local_user_id:b.local_user_id??old?.local_user_id,reason:b.reason});
   return {ok:true,status:200};
  });
  return c.json(result,result.status as 200|400|404|409);
 });
}
