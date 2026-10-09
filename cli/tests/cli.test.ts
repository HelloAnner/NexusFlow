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
});
test("missing command arguments fail before network calls",()=>{expect(()=>commandRequest(parseArgs(["projects","create","{bad}"]))).toThrow("expected a JSON object");expect(()=>commandRequest(parseArgs(["dispatch","submit"]))).toThrow("requires dispatch ID");});
