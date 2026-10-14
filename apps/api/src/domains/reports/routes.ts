import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { insertRecord } from "../../records.ts";
import { addAudit } from "../../shared/audit.ts";
import { report } from "./service.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/reports/:type",async c=>{const value=await report(actor(c),c.req.param("type"),c.req.query());return c.json(value,"error" in value?400:200);});
app.post("/api/reports/:type/export",async c=>{const user=actor(c);const value=await report(user,c.req.param("type"),c.req.query());if("error" in value)return c.json(value,400);const id=sql?await insertRecord(sql,user,"reports",{...value,org_id:user.org_id,generated_by:user.id}):value.snapshot_id;await addAudit(sql,user,"report.export","reports",String(id),{type:c.req.param("type"),from:value.period_start,to:value.period_end});return c.json({...value,id},201);});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["reports"]);}
