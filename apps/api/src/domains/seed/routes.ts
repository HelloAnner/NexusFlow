import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { canManage,actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { seedDemo } from "./service.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/seed/status",async c=>{const user=actor(c);if(!canManage(user))return c.json({error:"forbidden"},403);const rows=sql?await sql`SELECT id FROM nexusflow.records WHERE kind='seed' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} LIMIT 1`:[];return c.json({seeded:rows.length>0});});
app.post("/api/seed",async c=>{if(!["super_admin","center_director"].includes(actor(c).role))return c.json({error:"forbidden"},403);return c.json(await seedDemo(actor(c)),{status:201,headers:{"cache-control":"no-store"}});});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["seed"]);}
