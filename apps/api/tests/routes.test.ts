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
test('unversioned exports revalidate while versioned Next assets remain immutable',async()=>{
 const {webAssets}=await import('../src/web-assets.generated');
 const paths=['chat.html','chat.txt','index.txt','manifest.json','brand.svg','_next/static/chunks/page-abc123.js','_next/static/css/abc123.css'];
 try{for(const path of paths){webAssets[path]=btoa('cache test');const response=await app.request('/'+path);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe(path.startsWith('_next/static/')?'public, max-age=31536000, immutable':'no-cache');}expect((await app.request('/chat.txt')).headers.get('content-type')).toBe('text/x-component');}
 finally{for(const path of paths)delete webAssets[path];}
});
