import { expect,test } from "bun:test";
import { parseArgs } from "../src/args";
import { commandRequest } from "../src/commands";
import { ApiError,build,Client,environmentClient } from "../src/client";
import { checkVersion,verifyB0 } from "../src/verify";
import { main } from "../src/index";
import { mkdtemp,readFile,stat,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const commit="a".repeat(40);
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
 const calls:{path:string;method:string}[]=[];let failPeople=false;
 const server=Bun.serve({port:0,fetch(request){
  const path=new URL(request.url).pathname;calls.push({path,method:request.method});
  const json=(value:unknown,status=200)=>Response.json(value,{status});
  if(path==="/api/system/version")return json({service:"nexusflow",version:commit});
  if(path==="/healthz")return json({ok:true,service:"nexusflow"});
  if(path==="/api/__nf_b0_unknown__")return json({error:"not found"},404);
  if(path==="/api/auth/login")return json({access_token:"synthetic-session",user:{id:"test-user",role:"super_admin"}});
  if(request.headers.get("authorization")!=="Bearer synthetic-session")return json({error:"unauthorized"},401);
  if(path==="/api/auth/logout")return json({ok:true});
  if(path==="/api/auth/me")return json({id:"test-user",role:"super_admin"});
  if(path==="/api/admin/preflight")return json({ok:true});
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
  failPeople=true;calls.length=0;
  await expect(verifyB0(client,commit,{username:"synthetic",password:"synthetic"})).rejects.toBeInstanceOf(ApiError);
  expect(calls.at(-1)?.path).toBe("/api/auth/logout");
 }finally{build.version=previous;server.stop(true);}
});
