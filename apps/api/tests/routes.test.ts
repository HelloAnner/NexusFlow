import { expect,test } from "bun:test";
import app from "../src/router";
test("specialized API paths remain routable ahead of generic collections",async()=>{
 for(const path of ["/api/orgs/tree","/api/load/person-1","/api/load/conflicts","/api/reports/task-overview","/api/admin/audit","/api/tools"]){const response=await app.request(path);expect(response.status).toBe(401);}
});
test("health route is public and stable",async()=>{const response=await app.request("/healthz");expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true,service:"nexusflow"});});
