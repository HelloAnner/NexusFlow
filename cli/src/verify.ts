import { parseArgs } from "./args";
import { ApiError, build, Client } from "./client";

export function checkVersion(value:any,expected:string) {
 if(!/^[a-f0-9]{40}$/.test(expected)||value?.service!=="nexusflow"||value.version!==expected)throw Error("service commit mismatch");
}
export function checkPreflight(value:any,secrets:string[]=[]) {
 const object=(v:any)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
 const fields=(v:any,keys:string[])=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const count=(v:any)=>Number.isSafeInteger(v)&&v>=0;
 if(!fields(value,["read_only","tenant_id","counts","warnings","provenance","server_time"])||value.read_only!==true||!(value.tenant_id===null||typeof value.tenant_id==="string")||typeof value.server_time!=="string"||!Number.isFinite(Date.parse(value.server_time)))throw Error("invalid read-only preflight DTO");
 if(!object(value.counts)||!Object.entries(value.counts).every(([kind,n])=>/^[a-z][a-z0-9_]*$/.test(kind)&&count(n))||!Object.hasOwn(value.counts,"users"))throw Error("invalid preflight object counts");
 if(!Array.isArray(value.warnings)||!value.warnings.every((w:any)=>fields(w,["code","count","message"])&&typeof w.code==="string"&&/^[a-z][a-z0-9_]*$/.test(w.code)&&count(w.count)&&typeof w.message==="string"))throw Error("invalid preflight warnings");
 if(!fields(value.provenance,["candidates","account_candidates","ownership_verified"])||!count(value.provenance.candidates)||!count(value.provenance.account_candidates)||typeof value.provenance.ownership_verified!=="boolean")throw Error("invalid preflight provenance");
 const inspect=(v:any):void=>{
  if(typeof v==="string"){
   if(secrets.some(s=>s&&(v===s||s.length>=8&&v.includes(s)))||/\b(?:Bearer\s+\S+|(?:postgres(?:ql)?|redis|rediss):\/\/|(?:password|secret|access_token)\s*[:=])/i.test(v))throw Error("preflight contains secret material");
  }else if(object(v)||Array.isArray(v))for(const [key,item] of Object.entries(v)){
   if(/password|secret|token|credential|authorization|cookie|database_url|redis_url/i.test(key))throw Error("preflight contains secret fields");
   inspect(item);
  }
 };
 inspect(value);
}
export async function verifyB0(client:Client,expected:string,credentials:{username:string;password:string}) {
 const checks:string[]=[];
 const check=async(name:string,run:()=>Promise<void>)=>{try{await run();checks.push(name);}catch(e){if(e instanceof Error)e.message=`verify ${name}: ${e.message}`;throw e;}};
 const command=(...argv:string[])=>client.command(parseArgs(argv));
 // No seed, readyz, conflict recalculation or business mutations. Session only is temporary.
 const anonymous=new Client(client.base);
 await check("version",async()=>{checkVersion(await anonymous.command(parseArgs(["version"])),expected);if(build.version!==expected)throw Error("CLI commit mismatch");});
 await check("health",async()=>{const value=await anonymous.command(parseArgs(["health"]));if(value.ok!==true||value.service!=="nexusflow")throw Error("unhealthy service");});
 await check("anonymous unknown API JSON401/403",async()=>{try{await anonymous.json("/api/__nf_b0_unknown__");throw Error("unauthenticated unknown API accepted");}catch(e){if(!(e instanceof ApiError)||![401,403].includes(e.status)||!e.json||typeof e.json!=="object"||Array.isArray(e.json)||!("error" in e.json))throw e;}});
 for(const argv of [["auth","me"],["admin","preflight"],["projects","list"]])await check(`authorization ${argv.join(" ")}`,async()=>{try{await anonymous.command(parseArgs(argv));throw Error("unauthenticated request accepted");}catch(e){if(!(e instanceof ApiError)||![401,403].includes(e.status))throw e;}});
 await check("invalid session rejected",async()=>{try{await new Client(client.base,"nf-b0-invalid-session").command(parseArgs(["auth","me"]));throw Error("invalid session accepted");}catch(e){if(!(e instanceof ApiError)||![401,403].includes(e.status))throw e;}});
 const old=client.token;client.token="";let loggedIn:any,me:any;
 try {
  await check("login",async()=>{loggedIn=await client.login(credentials.username,credentials.password);if(loggedIn?.role!=="super_admin"||!loggedIn.id)throw Error("configured administrator is not super_admin");});
  await check("me",async()=>{me=await command("auth","me");if(me?.id!==loggedIn.id||me?.role!==loggedIn.role)throw Error("login/me identity mismatch");});
  await check("authenticated unknown API JSON404",async()=>{try{await client.json("/api/__nf_b0_unknown__");throw Error("unknown API accepted");}catch(e){if(!(e instanceof ApiError)||e.status!==404||!e.json||typeof e.json!=="object"||Array.isArray(e.json)||!("error" in e.json))throw e;}});
  await check("admin preflight",async()=>{const value=await command("admin","preflight");checkPreflight(value,[credentials.password,client.token]);if(value.tenant_id!==me.tenant_id)throw Error("preflight tenant mismatch");});
  for(const domain of ["orgs","people","projects","tasks","load","files","inbox","config","tools"]){await check(`${domain} list`,async()=>{const value=await command(domain,"list");if(!Array.isArray(value?.items))throw Error(`invalid ${domain} list envelope`);});}
  await check("org tree",async()=>{if(!Array.isArray((await command("orgs","tree"))?.items))throw Error("invalid org tree");});
  await check("home",async()=>{const value=await command("home");if(!value?.stats||!Array.isArray(value.today_focus))throw Error("invalid home aggregate");});
  await check("gantt",async()=>{if(!Array.isArray((await command("gantt"))?.items))throw Error("invalid gantt envelope");});
  for(const type of ["task-overview","people-load","files","conflicts","projects"])await check(`report ${type}`,async()=>{const value=await command("reports","list",type);if(value.report_type!==type||!value.payload)throw Error("invalid report aggregate");});
 } finally {
  try{if(client.token)await command("auth","logout");}finally{client.token=old;}
 }
 return {ok:true,slice:"B0",version:expected,checks,business_writes:false,limitations:["No authenticated member/tenant matrix: no isolated fixture supplied", "No browser or business write lifecycle coverage", "Other modules remain pending"]};
}
