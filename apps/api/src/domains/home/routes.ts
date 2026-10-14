import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { home } from "./service.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/home",async c=>home(actor(c)));
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,[]);}
