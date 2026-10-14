import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { listRecords } from "../../records.ts";
import { demoTools } from "../../demo-seed.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/tools",async c=>{const items=await listRecords(actor(c),"tools");return c.json({items:items.length?items:demoTools});});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["tools"]);}
