import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { getRecord } from "../../records.ts";
import { decideApprovalWorkflow } from "./service.ts";
export function registerRoutes(app:ApiApp){
app.post("/api/approvals/:id/decision",async c=>{const user=actor(c),body=await c.req.json().catch(()=>({}));if(typeof body.approved!=="boolean")return c.json({error:"approved boolean required"},400);const approval=await getRecord(user,"approvals",c.req.param("id"));if(!approval||approval.status!=="pending")return c.json({error:"approval is not pending"},409);if(approval.approver_id!==user.id&&!["super_admin","center_director"].includes(user.role))return c.json({error:"forbidden"},403);if(!body.approved&&!String(body.reason||"").trim())return c.json({error:"rejection reason required"},400);if(!sql)return c.json({error:"DATABASE_URL required"},503);const out=await decideApprovalWorkflow(user,approval,body);return c.json(out);});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["approvals"]);}
