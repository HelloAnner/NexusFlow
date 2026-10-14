import { expect,test } from "bun:test";
import { api,ApiError,resetApiSession,sessionEpoch,sessionTenant } from "../../web/lib/api.ts";

// Browser-shaped memory only: no DOM, real storage, sockets, tokens or credentials.
async function withBrowser(check:(storage:Map<string,string>,location:{pathname:string;href:string})=>Promise<void>){
 const previousFetch=globalThis.fetch,windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,"window"),storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
 const storage=new Map([["nf_token","test-session-A"]]),location={pathname:"/nexusflow/projects",href:"unchanged"};
 Object.defineProperty(globalThis,"window",{configurable:true,value:{location}});
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null}});
 resetApiSession();
 try{await check(storage,location);}finally{
  globalThis.fetch=previousFetch;
  for(const [key,descriptor] of [["window",windowDescriptor],["localStorage",storageDescriptor]] as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  resetApiSession();
 }
}
async function stale(pending:Promise<unknown>){
 const error=await pending.then(()=>null,error=>error);
 expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({status:409,code:"SESSION_CHANGED"});
}
test("A success arriving after token-only switch to B is rejected without another request",async()=>withBrowser(async(storage,location)=>{
 let release!:(response:Response)=>void;
 globalThis.fetch=(()=>new Promise<Response>(resolve=>{release=resolve;})) as typeof fetch;
 const pending=api("/projects");storage.set("nf_token","test-session-B");
 release(Response.json({items:[{id:"A-private-record"}]}));await stale(pending);
 expect(storage.get("nf_token")).toBe("test-session-B");expect(location.href).toBe("unchanged");
}));
test("late A 401 cannot clear an established B identity or redirect B to login",async()=>withBrowser(async(storage,location)=>{
 let release!:(response:Response)=>void;
 globalThis.fetch=(()=>new Promise<Response>(resolve=>{release=resolve;})) as typeof fetch;
 const pending=api("/projects");storage.set("nf_token","test-session-B");
 globalThis.fetch=(async()=>Response.json({id:"B",tenant_id:"tenant-B"})) as typeof fetch;
 await api("/auth/me");const epoch= sessionEpoch();
 release(Response.json({error:"unauthorized"},{status:401}));await stale(pending);
 expect(sessionEpoch()).toBe(epoch);expect(sessionTenant()).toBe("tenant-B");expect(location.href).toBe("unchanged");expect(storage.get("nf_token")).toBe("test-session-B");
}));
test("late A auth/me cannot overwrite B identity/tenant",async()=>withBrowser(async(storage,location)=>{
 let release!:(response:Response)=>void;
 globalThis.fetch=(()=>new Promise<Response>(resolve=>{release=resolve;})) as typeof fetch;
 const pending=api("/auth/me");storage.set("nf_token","test-session-B");
 globalThis.fetch=(async()=>Response.json({id:"B",tenant_id:"tenant-B"})) as typeof fetch;
 await api("/auth/me");const epoch=sessionEpoch();
 release(Response.json({id:"A",tenant_id:"tenant-A"}));await stale(pending);
 expect(sessionEpoch()).toBe(epoch);expect(sessionTenant()).toBe("tenant-B");expect(location.href).toBe("unchanged");
}));
test("switch during JSON body decoding also rejects the old auth/me response",async()=>withBrowser(async(storage)=>{
 let release!:(body:unknown)=>void,started!:()=>void;
 const reading=new Promise<void>(resolve=>{started=resolve;}),response=Response.json({});
 response.json=()=>{started();return new Promise(resolve=>{release=resolve;});};
 globalThis.fetch=(async()=>response) as typeof fetch;
 const pending=api("/auth/me");await reading;storage.set("nf_token","test-session-B");
 release({id:"A",tenant_id:"tenant-A"});await stale(pending);expect(sessionTenant()).not.toBe("tenant-A");
}));
