import type { ApiApp } from "../../shared/http.ts";
import { registerRecordRoutes } from "../../shared/record-routes.ts";
import { actor } from "../../permissions.ts";
import { listRecords } from "../../records.ts";
import { validDate } from "../../load.ts";
import { conflicts } from "../conflicts/service.ts";
export function registerRoutes(app:ApiApp){
app.get("/api/gantt",async c=>{let tasks=await listRecords(actor(c),"tasks");const q=c.req.query();for(const key of ["project_id","owner_id","org_id","status"] as const){const value=q[key];if(value)tasks=tasks.filter(x=>String(x[key]||"")===value);}const start=q.start?new Date(q.start):null,end=q.end?new Date(q.end):null;if(q.start&&!validDate(q.start)||q.end&&!validDate(q.end)||start&&!Number.isFinite(start.valueOf())||end&&!Number.isFinite(end.valueOf()))return c.json({error:"invalid date range"},400);if(start)tasks=tasks.filter(x=>String(x.end_date)>=start!.toISOString().slice(0,10));if(end)tasks=tasks.filter(x=>String(x.start_date)<=end!.toISOString().slice(0,10));if(q.risk_only==="true"){const ids=new Set((await conflicts(actor(c))).map(x=>x.task_id));tasks=tasks.filter(x=>ids.has(x.id));}return c.json({data_scope_applied:true,items:tasks.map(x=>({...x,summary:x.summary||x.description||""}))});});
app.get("/api/gantt/summary",async c=>{const tasks=await listRecords(actor(c),"tasks");const risk=await conflicts(actor(c));return c.json({data_scope_applied:true,in_progress:tasks.filter(x=>x.status==="in_progress").length,acceptance_pending:tasks.filter(x=>x.status==="pending_acceptance").length,archived:tasks.filter(x=>x.status==="archived").length,open_risk:risk.length});});
}
export function registerRecords(app:ApiApp){registerRecordRoutes(app,[]);}
