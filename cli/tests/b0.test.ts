import { expect,test } from "bun:test";
import { parseArgs } from "../src/args";
import { commandRequest } from "../src/commands";
import { ApiError,build,Client,environmentClient } from "../src/client";
import { checkPreflight,checkVersion,verifyB0 } from "../src/verify";
import { main } from "../src/index";
import { mkdtemp,readFile,stat,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const commit="a".repeat(40);
const preflight=()=>({read_only:true,tenant_id:"local",counts:{users:1,tasks:0},warnings:[{code:"missing_account_org",count:1,message:"Accounts have no organization binding."}],provenance:{candidates:0,account_candidates:0,ownership_verified:false},server_time:"2026-10-14T00:00:00.000Z"});
test("preflight requires the read-only aggregate DTO and rejects secret material",()=>{
 expect(()=>checkPreflight(preflight(),["synthetic-private-session"])).not.toThrow();
 for(const value of [null,[],{}, {...preflight(),read_only:false}, {...preflight(),counts:{users:"1"}}, {...preflight(),counts:[]}, {...preflight(),counts:{users:-1}}, {...preflight(),warnings:[{code:"bad",count:0,message:{}}]}, {...preflight(),provenance:{candidates:0,account_candidates:0,ownership_verified:"false"}}, {...preflight(),server_time:"invalid"}, {...preflight(),access_token:"synthetic-private-session"}, {...preflight(),counts:{users:1,password:1}}, {...preflight(),warnings:[{code:"bad",count:1,message:"postgres://synthetic:secret@localhost/db"}]}, {...preflight(),warnings:[{code:"bad",count:1,message:"synthetic-private-session"}]}]){
  expect(()=>checkPreflight(value,["synthetic-private-session"])).toThrow();
 }
});
test("login and register save private tokens only when requested, never log tokens",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"nf-cli-check-"));
 const server=Bun.serve({port:0,fetch(request){return Response.json({access_token:"synthetic-private-session",token_type:"bearer",user:{id:"test-user",role:"member"}},{status:new URL(request.url).pathname==="/api/auth/register"?201:200});}});
 const keys=["NEXUSFLOW_URL","NEXUSFLOW_BASE_PATH","NEXUSFLOW_USER","NEXUSFLOW_PASSWORD"];
 const old=keys.map(k=>process.env[k]);const log=console.log;const output:string[]=[];
 try{
  process.env.NEXUSFLOW_URL=`http://127.0.0.1:${server.port}`;process.env.NEXUSFLOW_BASE_PATH="";process.env.NEXUSFLOW_USER="synthetic";process.env.NEXUSFLOW_PASSWORD="synthetic";
  console.log=(value:unknown)=>{output.push(String(value));};
  for(const action of ["login","register"]){
   const args=action==="login"?["auth","login"]:["auth","register","--username","synthetic","--display-name","Synthetic","--password","synthetic-password","--invitation-token","synthetic-invitation"];
   const tokenFile=join(directory,action);
   await main([...args,"--token-file",tokenFile,"--json"]);
   expect(await readFile(tokenFile,"utf8")).toBe("synthetic-private-session");
   expect((await stat(tokenFile)).mode&0o777).toBe(0o600);
   await main([...args,"--json"]);
  }
  expect(output.join("")).not.toContain("synthetic-private-session");
  expect(output.join("")).not.toContain("access_token");
  process.env.NEXUSFLOW_URL="http://synthetic:private@127.0.0.1";
  expect(()=>environmentClient()).toThrow("without credentials/query/hash");
 }finally{console.log=log;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});server.stop(true);await rm(directory,{recursive:true,force:true});}
});
test("version/preflight preserve the C0 read contract",()=>{
 expect(commandRequest(parseArgs(["version"]))).toEqual({path:"/api/system/version",method:"GET"});
 expect(commandRequest(parseArgs(["admin","preflight"]))).toEqual({path:"/api/admin/preflight",method:"GET"});
 expect(parseArgs(["version","--local"]).options.local).toBe(true);
 expect(()=>checkVersion({service:"nexusflow",version:"short"},commit)).toThrow("commit mismatch");
 expect(()=>checkVersion({service:"other",version:commit},commit)).toThrow("commit mismatch");
});
test("reusable B0 verifier reads domains, rejects unauthorized access, and revokes its session",async()=>{
 const calls:{path:string;method:string;authenticated:boolean}[]=[];let failPeople=false,anonymousStatus=401,unknownHtml=false,authenticatedStatus=404,badPreflight=false;
 const server=Bun.serve({port:0,fetch(request){
  const path=new URL(request.url).pathname;const authenticated=request.headers.get("authorization")==="Bearer synthetic-session";calls.push({path,method:request.method,authenticated});
  const json=(value:unknown,status=200)=>Response.json(value,{status});
  if(path==="/api/system/version")return json({service:"nexusflow",version:commit});
  if(path==="/healthz")return json({ok:true,service:"nexusflow"});
  if(path==="/api/__nf_b0_unknown__"){
   if(unknownHtml)return new Response("<html>fallback</html>",{status:anonymousStatus,headers:{"content-type":"text/html"}});
   return authenticated?json({error:"not found"},authenticatedStatus):json({error:"unauthorized"},anonymousStatus);
  }
  if(path==="/api/auth/login")return json({access_token:"synthetic-session",user:{id:"test-user",role:"super_admin"}});
  if(!authenticated)return json({error:"unauthorized"},401);
  if(path==="/api/auth/logout")return json({ok:true});
  if(path==="/api/auth/me")return json({id:"test-user",role:"super_admin",tenant_id:"local"});
  if(path==="/api/admin/preflight")return json(badPreflight?{...preflight(),read_only:false}:preflight());
  if(path==="/api/home")return json({stats:{},today_focus:[]});
  if(path.startsWith("/api/reports/"))return json({report_type:path.split("/").at(-1),payload:{}});
  if(path==="/api/people"&&failPeople)return json({error:"unavailable"},503);
  return json({items:[]});
 }});
 const previous=build.version;build.version=commit;
 try{
  const client=new Client(`http://127.0.0.1:${server.port}`);
  const result=await verifyB0(client,commit,{username:"synthetic",password:"synthetic"});
  expect(result.ok).toBe(true);expect(result.business_writes).toBe(false);expect(client.token).toBe("");
  expect(calls.filter(x=>x.method!=="GET").map(x=>x.path)).toEqual(["/api/auth/login","/api/auth/logout"]);
  expect(result.checks).toContain("report conflicts");
  expect(result.checks).toContain("anonymous unknown API JSON401/403");
  expect(result.checks).toContain("authenticated unknown API JSON404");
  expect(calls.filter(x=>x.path==="/api/__nf_b0_unknown__").map(x=>x.authenticated)).toEqual([false,true]);
  expect(calls.findIndex(x=>x.path==="/api/auth/me"&&x.authenticated)).toBeLessThan(calls.findIndex(x=>x.path==="/api/__nf_b0_unknown__"&&x.authenticated));
  anonymousStatus=403;
  expect((await verifyB0(client,commit,{username:"synthetic",password:"synthetic"})).ok).toBe(true);
  anonymousStatus=404;calls.length=0;
  await expect(verifyB0(client,commit,{username:"synthetic",password:"synthetic"})).rejects.toThrow("anonymous unknown API");
  expect(calls.some(x=>x.method==="POST")).toBe(false);
  anonymousStatus=401;unknownHtml=true;
  await expect(verifyB0(client,commit,{username:"synthetic",password:"synthetic"})).rejects.toThrow("expected API JSON");
  unknownHtml=false;authenticatedStatus=401;calls.length=0;
  await expect(verifyB0(client,commit,{username:"synthetic",password:"synthetic"})).rejects.toThrow("authenticated unknown API");
  expect(calls.at(-1)?.path).toBe("/api/auth/logout");
  authenticatedStatus=404;badPreflight=true;calls.length=0;
  await expect(verifyB0(client,commit,{username:"synthetic",password:"synthetic"})).rejects.toThrow("read-only preflight DTO");
  expect(calls.at(-1)?.path).toBe("/api/auth/logout");expect(client.token).toBe("");
  badPreflight=false;failPeople=true;calls.length=0;
  await expect(verifyB0(client,commit,{username:"synthetic",password:"synthetic"})).rejects.toBeInstanceOf(ApiError);
  expect(calls.at(-1)?.path).toBe("/api/auth/logout");
 }finally{build.version=previous;server.stop(true);}
});
