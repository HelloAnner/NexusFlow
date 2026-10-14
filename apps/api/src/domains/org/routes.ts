import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { orgTree } from "./service.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/org/tree",async c=>orgTree(actor(c)));
app.get("/api/orgs/tree",async c=>orgTree(actor(c)));
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["orgs"]);}
