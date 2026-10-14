import { expect,test } from "bun:test";
// Run this file in its own server-side process without service credentials.
delete process.env.DATABASE_URL;delete process.env.REDIS_URL;
const {default:app}=await import("../src/router");
test("specialized API paths remain routable ahead of generic collections",async()=>{
 for(const path of ["/api/orgs/tree","/api/load/person-1","/api/load/conflicts","/api/reports/task-overview","/api/admin/audit","/api/tools"]){const response=await app.request(path);expect(response.status).toBe(401);}
});
test("unknown unauthenticated API is JSON, never a static HTML fallback",async()=>{
 const response=await app.request("/api/does-not-exist");expect(response.status).toBe(401);expect(response.headers.get("content-type")).toContain("application/json");const body=await response.json();expect(body.error).toBe("unauthorized");expect(body.request_id).toBe(response.headers.get("x-request-id"));
});
test("system version is public and reads the directly defined build identity",async()=>{
 const response=await app.request("/api/system/version");expect(response.status).toBe(200);expect(await response.json()).toMatchObject({service:"nexusflow",version:process.env.NEXUSFLOW_BUILD_COMMIT||"unknown"});
});
test("readyz without dependencies returns a sanitized read-only failure",async()=>{
 const response=await app.request("/readyz");expect(response.status).toBe(503);expect(await response.json()).toEqual({ok:false,read_only:true,error:"dependencies unavailable"});
});
test("health route is public and stable",async()=>{const response=await app.request("/healthz");expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true,service:"nexusflow"});});
