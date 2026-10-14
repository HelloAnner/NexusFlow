import { expect,test } from "bun:test";
import { listDto,unwrapList } from "../../../packages/shared/src/contracts.ts";
import { auditContext,auditSummary,addAudit,sourceIp } from "../src/shared/audit.ts";
import { seedAllowed } from "../src/domains/seed/policy.ts";
import { errorStatus } from "../src/shared/http.ts";
import { api,sessionEpoch,resetApiSession } from "../../web/lib/api.ts";

test("list DTO preserves items compatibility and paginates only when requested",()=>{
 expect(listDto([1,2,3])).toEqual({items:[1,2,3],total:3,page:1,page_size:3});
 expect(listDto([1,2,3],{page:"2",page_size:"2"})).toEqual({items:[3],total:3,page:2,page_size:2});
 expect(unwrapList({items:[]})).toEqual([]);
 for(const value of [[],null,{items:"bad"},{items:[],total:-1}])expect(()=>unwrapList(value)).toThrow();
 for(const query of [{page:"0"},{page:"1.5"},{page_size:"501"},{page_size:"0"}])expect(()=>listDto([],query)).toThrow();
});
test("audit whitelist removes nested secrets and trusts only the configured proxy chain",async()=>{
 const secret={password:"p",token:"t",invitation_token:"i",password_hash:"h",secret_key:"s"};
 expect(auditSummary({before:{name:"old",...secret},after:{status:"active",...secret}})).toEqual({before:{name:"old"},after:{status:"active"}});
 const headers=new Headers({"x-forwarded-for":"203.0.113.7, 10.0.0.2"});
 expect(sourceIp("198.51.100.3",headers,["10.0.0.2"])).toBe("198.51.100.3");
 expect(sourceIp("10.0.0.1",headers,["10.0.0.1","10.0.0.2"])).toBe("203.0.113.7");
 expect(sourceIp(null,headers)).toBeNull();
 expect(sourceIp("10.0.0.1",new Headers({"x-forwarded-for":"not-an-ip"}),["10.0.0.1"])).toBe("10.0.0.1");
 let values:any[]=[];const tx:any=async(_strings:any,...v:any[])=>{values=v;};tx.json=(value:any)=>value;
 await auditContext.run({request_id:"check-1",source_ip:"203.0.113.7"},()=>addAudit(tx,{id:"actor",tenant_id:"isolated"} as any,"tasks.update","tasks","object",{before:{status:"draft",...secret},after:{status:"active",...secret},reason:"confirmed"}));
 expect(values[6]).toMatchObject({tenant_id:"isolated",actor:"actor",action:"tasks.update",object_kind:"tasks",object_id:"object",source_ip:"203.0.113.7",request_id:"check-1",reason:"confirmed",result:"success"});
 expect(Number.isFinite(Date.parse(values[6].server_time))).toBe(true);expect(JSON.stringify(values)).not.toContain("password");
});
test("seed defaults closed and requires explicit isolated-tenant authority",()=>{
 const user:any={role:"super_admin",tenant_id:"nf-isolated-check",portal_permissions:null};
 expect(seedAllowed(user,"true","nf-isolated-check")).toBe(true);
 for(const [enabled,tenant] of [["false","nf-isolated-check"],["true","local"],["true","production"],["true","different"],["true",""]])expect(seedAllowed(user,enabled,tenant)).toBe(false);
 expect(seedAllowed({...user,role:"member"},"true","nf-isolated-check")).toBe(false);
 expect(errorStatus(new SyntaxError("bad JSON"))).toBe(400);
 expect(errorStatus(new Error("unexpected database details"))).toBe(500);
});
test("web API refuses HTML, invalid JSON, and old-session in-flight results",async()=>{
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=(async()=>new Response("<html>fallback</html>",{headers:{"content-type":"text/html"}})) as typeof fetch;
  await expect(api("/tools")).rejects.toThrow("non-JSON");
  globalThis.fetch=(async()=>new Response("broken",{headers:{"content-type":"application/json"}})) as typeof fetch;
  await expect(api("/tools")).rejects.toThrow("invalid JSON");
  globalThis.fetch=(async()=>Response.json({items:[]})) as typeof fetch;expect(await api("/tools")).toEqual({items:[]});
  let release!:(response:Response)=>void;
  globalThis.fetch=((..._args:any[])=>new Promise<Response>(resolve=>{release=resolve;})) as typeof fetch;
  const pending=api("/tools"),before=sessionEpoch();resetApiSession();expect(sessionEpoch()).toBeGreaterThan(before);
  release(Response.json({items:[{id:"old-user"}]}));await expect(pending).rejects.toThrow("session changed");
 }finally{globalThis.fetch=previous;}
});
