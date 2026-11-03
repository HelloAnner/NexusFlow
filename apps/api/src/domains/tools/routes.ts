import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { listRecords } from "../../records.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/tools",async c=>c.json({items:await listRecords(actor(c),"tools")}));
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["tools"]);}
