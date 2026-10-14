import { expect,test } from "bun:test";
import { api,ApiError,resetApiSession,sessionEpoch,sessionTenant } from "../../web/lib/api.ts";
import { useAuth } from "../../web/lib/auth.ts";

// Server tsc must reject a circular initializer silently degrading the hook/store to any.
type Assert<T extends true> = T;
type NotAny<T> = 0 extends (1 & T) ? false : true;
export type AuthHookIsTyped = Assert<NotAny<typeof useAuth>>;
export type AuthStateIsTyped = Assert<NotAny<ReturnType<typeof useAuth.getState>>>;
const originalFetch=globalThis.fetch;

// Browser-shaped memory only: no DOM, real storage, sockets, tokens or credentials.
async function withBrowser(check:(storage:Map<string,string>,location:{pathname:string;href:string})=>Promise<void>){
 const previousFetch=globalThis.fetch,windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,"window"),storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,"localStorage"),previousAuth=useAuth.getState();
 const storage=new Map([["nf_token","test-session-A"]]),location={pathname:"/nexusflow/projects",href:"unchanged"};
 Object.defineProperty(globalThis,"window",{configurable:true,value:{location}});
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null}});
 resetApiSession();useAuth.setState({user:{id:"A",username:"A",name:"A",role:"member"},checked:false});
 try{await check(storage,location);}finally{
  useAuth.setState({user:previousAuth.user,checked:previousAuth.checked});
  globalThis.fetch=previousFetch;
  for(const [key,descriptor] of [["window",windowDescriptor],["localStorage",storageDescriptor]] as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  resetApiSession();
 }
}
async function stale(pending:Promise<unknown>){
 const error=await pending.then(()=>null,error=>error);
 expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({status:409,code:"SESSION_CHANGED"});
 return error;
}
test("A success arriving after token-only switch to B is rejected without another request",async()=>withBrowser(async(storage,location)=>{
 let release!:(response:Response)=>void;
 globalThis.fetch=Object.assign(()=>new Promise<Response>(resolve=>{release=resolve;}),{preconnect:originalFetch.preconnect});
 const pending=api("/projects");storage.set("nf_token","test-session-B");
 release(Response.json({items:[{id:"A-private-record"}]}));await stale(pending);
 expect(storage.get("nf_token")).toBe("test-session-B");expect(location.href).toBe("unchanged");
}));
test("late A 401 cannot clear an established B identity or redirect B to login",async()=>withBrowser(async(storage,location)=>{
 let release!:(response:Response)=>void;
 globalThis.fetch=Object.assign(()=>new Promise<Response>(resolve=>{release=resolve;}),{preconnect:originalFetch.preconnect});
 const pending=api("/projects");storage.set("nf_token","test-session-B");
 globalThis.fetch=Object.assign(async()=>Response.json({id:"B",tenant_id:"tenant-B"}),{preconnect:originalFetch.preconnect});
 await api("/auth/me");const epoch= sessionEpoch();
 release(Response.json({error:"unauthorized"},{status:401}));await stale(pending);
 expect(sessionEpoch()).toBe(epoch);expect(sessionTenant()).toBe("tenant-B");expect(location.href).toBe("unchanged");expect(storage.get("nf_token")).toBe("test-session-B");
}));
test("late A auth/me cannot overwrite B identity/tenant",async()=>withBrowser(async(storage,location)=>{
 let release!:(response:Response)=>void;
 globalThis.fetch=Object.assign(()=>new Promise<Response>(resolve=>{release=resolve;}),{preconnect:originalFetch.preconnect});
 const pending=api("/auth/me");storage.set("nf_token","test-session-B");
 globalThis.fetch=Object.assign(async()=>Response.json({id:"B",tenant_id:"tenant-B"}),{preconnect:originalFetch.preconnect});
 await api("/auth/me");const epoch=sessionEpoch();
 release(Response.json({id:"A",tenant_id:"tenant-A"}));await stale(pending);
 expect(sessionEpoch()).toBe(epoch);expect(sessionTenant()).toBe("tenant-B");expect(location.href).toBe("unchanged");
}));
test("switch during JSON body decoding also rejects the old auth/me response",async()=>withBrowser(async(storage)=>{
 let release!:(body:unknown)=>void,started!:()=>void;
 const reading=new Promise<void>(resolve=>{started=resolve;}),response=Response.json({});
 response.json=()=>{started();return new Promise(resolve=>{release=resolve;});};
 globalThis.fetch=Object.assign(async()=>response,{preconnect:originalFetch.preconnect});
 const pending=api("/auth/me");await reading;storage.set("nf_token","test-session-B");
 release({id:"A",tenant_id:"tenant-A"});await stale(pending);expect(sessionTenant()).not.toBe("tenant-A");
}));
test("real fetchMe preserves B store when old A me arrives; raw API still rejects",async()=>withBrowser(async(storage,location)=>{
 const releases:Array<(response:Response)=>void>=[];
 globalThis.fetch=Object.assign(()=>new Promise<Response>(resolve=>{releases.push(resolve);}),{preconnect:originalFetch.preconnect});
 const oldMe=useAuth.getState().fetchMe(),rawRejection=stale(api("/auth/me"));expect(releases).toHaveLength(2);
 storage.set("nf_token","test-session-B");
 globalThis.fetch=Object.assign(async()=>Response.json({id:"B",username:"B",role:"member",tenant_id:"tenant-B"}),{preconnect:originalFetch.preconnect});
 const userB=await useAuth.getState().fetchMe(),state=useAuth.getState(),epoch=sessionEpoch();
 expect(userB).toMatchObject({id:"B"});expect(state.checked).toBe(true);
 for(const release of releases)release(Response.json({id:"A",username:"A",role:"member",tenant_id:"tenant-A"},{headers:{"x-request-id":"late-me-A"}}));
 expect(await oldMe).toBe(userB);expect((await rawRejection).request_id).toBe("late-me-A");
 expect(useAuth.getState()).toBe(state);expect(sessionEpoch()).toBe(epoch);expect(sessionTenant()).toBe("tenant-B");
 expect(storage.get("nf_token")).toBe("test-session-B");expect(location.href).toBe("unchanged");
}));
test("real fetchMe preserves B user and checked=false during late A JSON decode; raw API still rejects",async()=>withBrowser(async(storage,location)=>{
 const releases:Array<(body:unknown)=>void>=[];let started!:()=>void;
 const reading=new Promise<void>(resolve=>{started=resolve;});
 globalThis.fetch=Object.assign(async()=>{
  const response=Response.json({},{headers:{"x-request-id":"decoding-me-A"}});
  response.json=()=>new Promise(resolve=>{releases.push(resolve);if(releases.length===2)started();});
  return response;
 },{preconnect:originalFetch.preconnect});
 const oldMe=useAuth.getState().fetchMe(),rawRejection=stale(api("/auth/me"));await reading;
 storage.set("nf_token","test-session-B");
 globalThis.fetch=Object.assign(async()=>Response.json({id:"B",username:"B",role:"member",tenant_id:"tenant-B"}),{preconnect:originalFetch.preconnect});
 const userB=await useAuth.getState().fetchMe();expect(userB).toMatchObject({id:"B"});
 // Another current-session check may be pending; a stale response must not set checked=true.
 useAuth.setState({checked:false});const state=useAuth.getState(),epoch=sessionEpoch();
 for(const release of releases)release({id:"A",username:"A",role:"member",tenant_id:"tenant-A"});
 expect(await oldMe).toBe(userB);expect((await rawRejection).request_id).toBe("decoding-me-A");
 expect(useAuth.getState()).toBe(state);expect(useAuth.getState().checked).toBe(false);
 expect(sessionEpoch()).toBe(epoch);expect(sessionTenant()).toBe("tenant-B");expect(location.href).toBe("unchanged");
 expect(storage.get("nf_token")).toBe("test-session-B");
}));
test("same-session authentication failure keeps the original fetchMe clear-user behavior",async()=>withBrowser(async()=>{
 globalThis.fetch=Object.assign(async()=>Response.json({error:"unauthorized"},{status:401}),{preconnect:originalFetch.preconnect});
 expect(await useAuth.getState().fetchMe()).toBeNull();expect(useAuth.getState().user).toBeNull();expect(useAuth.getState().checked).toBe(true);
}));
