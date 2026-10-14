import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
export function registerRoutes(app:ApiApp){
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,["people"]);}
