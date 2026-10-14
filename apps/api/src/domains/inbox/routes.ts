import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { getRecord } from "../../records.ts";
import { addAudit } from "../../shared/audit.ts";
export function registerRoutes(app:ApiApp){
app.post("/api/inbox/:id/read",async c=>{const user=actor(c),item=await getRecord(user,"inbox",c.req.param("id"));if(!item||item.user_id!==user.id)return c.json({error:"not found"},404);await sql!`UPDATE nexusflow.records SET data=data||${sql!.json({read_at:new Date().toISOString()} as any)},updated_at=now() WHERE id=${item.id} AND kind='inbox' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;return c.json({ok:true});});
app.post("/api/inbox/:id/complete",async c=>{const user=actor(c),item=await getRecord(user,"inbox",c.req.param("id")),body=await c.req.json().catch(()=>({}));if(!item||item.user_id!==user.id)return c.json({error:"not found"},404);if(!String(body.reason||"").trim())return c.json({error:"completion reason required"},400);await sql!`UPDATE nexusflow.records SET data=data||${sql!.json({status:"completed",completion_reason:body.reason,completed_at:new Date().toISOString(),completed_by:user.id} as any)},updated_at=now() WHERE id=${item.id} AND kind='inbox' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;await addAudit(sql,user,"inbox.complete","inbox",String(item.id),{reason:body.reason});return c.json({ok:true});});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["inbox", "mentions"]);}
