import { expect,test } from "bun:test";
import { parseArgs } from "../src/args.ts";
import { commandRequest } from "../src/commands.ts";
test("create preserves its JSON body after option parsing",()=>{const args=parseArgs(["projects","create",'{"name":"review"}',"--json"]);expect(commandRequest(args).body).toEqual({name:"review"});});
test("important workflows map to dedicated API operations",()=>{
 expect(commandRequest(parseArgs(["dispatch","submit","d-1"])).path).toBe("/api/dispatch/d-1/submit");
 expect(commandRequest(parseArgs(["approvals","decision","a-1","--approved","false","--reason","revise"])).body).toEqual({approved:false,reason:"revise"});
 expect(commandRequest(parseArgs(["tasks","action","t-1","--action","report","--progress","40"])).body).toEqual({action:"report",progress:"40"});
 expect(commandRequest(parseArgs(["reports","export","files","--from","2026-01-01","--out","files.json"])).download).toBe("files.json");
 expect(commandRequest(parseArgs(["people","load","u-1","--date=2026-06-01"])).path).toBe("/api/load/u-1?date=2026-06-01");
 expect(commandRequest(parseArgs(["admin","audit"])).path).toBe("/api/admin/audit");
 expect(commandRequest(parseArgs(["seed","status"])).path).toBe("/api/seed/status");
 expect(commandRequest(parseArgs(["projects","action","p-1","--action","pause","--reason","scope change"])).path).toBe("/api/projects/p-1/action");
 expect(commandRequest(parseArgs(["admin","delegations","u-1","--org-ids","o-1,o-2","--reason","coverage"])).body).toEqual({org_ids:["o-1","o-2"],reason:"coverage"});
 expect(commandRequest(parseArgs(["tasks","assign","t-1","--user-id","u-2","--start-date","2026-06-01","--end-date","2026-06-03","--daily-hours","4"])).body).toEqual({user_id:"u-2",start_date:"2026-06-01",end_date:"2026-06-03",daily_hours:4,all_day:false});
 expect(commandRequest(parseArgs(["task-assignments","action","a-1","--action","submit","--result","done"])).path).toBe("/api/task_assignments/a-1/action");
 expect(commandRequest(parseArgs(["files","rollback","f-1","--version-id","f-0","--reason","restore"])).body).toEqual({version_id:"f-0",reason:"restore"});
});
test("missing command arguments fail before network calls",()=>{expect(()=>commandRequest(parseArgs(["projects","create","{bad}"]))).toThrow("expected a JSON object");expect(()=>commandRequest(parseArgs(["dispatch","submit"]))).toThrow("requires dispatch ID");expect(()=>commandRequest(parseArgs(["tasks","assign","t-1","--user-id","u-2"]))).toThrow("requires ID");});
