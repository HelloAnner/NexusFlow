import type { CliArgs } from "./args";
import { option } from "./args";
import { commandRequest } from "./commands";

export const build = { service:"nexusflow", version:process.env.NEXUSFLOW_BUILD_COMMIT || "unbuilt", build_time:process.env.NEXUSFLOW_BUILD_TIME || null };
export class ApiError extends Error {
 constructor(public status:number, public json:unknown) { super(`API request failed (${status})`); }
}
export class Client {
 constructor(public base:string, public token="") {}
 async request(path:string, method="GET", body?:BodyInit, contentType?:string, extra?:Record<string,string>) {
  const headers=new Headers({accept:"application/json"});
  if(this.token)headers.set("authorization",`Bearer ${this.token}`);
  if(contentType)headers.set("content-type",contentType);
  for(const [key,value] of Object.entries(extra??{}))headers.set(key,value);
  return fetch(this.base+path,{method,headers,body,redirect:"error",signal:AbortSignal.timeout(30000)});
 }
 async json(path:string,method="GET",body?:unknown,extra?:Record<string,string>):Promise<any> {
  const response=await this.request(path,method,body===undefined?undefined:JSON.stringify(body),body===undefined?undefined:"application/json",extra);
  let value:unknown;
  try { value=await response.json(); } catch { throw Error(`expected API JSON (${response.status})`); }
  if(!response.headers.get("content-type")?.includes("application/json"))throw Error("expected application/json");
  if(!response.ok)throw new ApiError(response.status,value);
  return value;
 }
 async command(args:CliArgs) {
  const r=commandRequest(args);
  if(!r.upload&&!r.download){
   const value=await this.json(r.path,r.method,r.body,r.headers);
   return args.command==="auth"&&args.action==="register"?this.acceptSession(value):value;
  }
  let body:BodyInit|undefined;
  if(r.upload){const file=Bun.file(r.upload);if(!await file.exists())throw Error("upload file not found");const form=new FormData();form.set("file",file,file.name);form.set("category",option(args,"category"));if(r.scope)form.set("scope",r.scope);for(const k of ["task-id","project-id"])if(option(args,k))form.set(k.replace("-","_"),option(args,k));body=form;}
  else if(r.body!==undefined)body=JSON.stringify(r.body);
  const response=await this.request(r.path,r.method,body,r.upload?undefined:r.body===undefined?undefined:"application/json",r.headers);
  if(!response.ok)throw new ApiError(response.status,null);
  if(r.download){await Bun.write(r.download,response);return {downloaded:r.download};}
  return response.json();
 }
 async login(username:string,password:string) {
  if(!username||!password)throw Error("administrator credentials required in environment");
  const value=await this.json("/api/auth/login","POST",{username,password});
  return this.acceptSession(value);
 }
 private acceptSession(value:any) {
  if(typeof value.access_token!=="string"||!value.access_token)throw Error("authentication did not return session");
  this.token=value.access_token;return value.user;
 }
}
export function environmentClient() {
 const root=(process.env.NEXUSFLOW_URL||"http://127.0.0.1:8089").replace(/\/+$/,"");
 let url:URL;try{url=new URL(root);}catch{throw Error("invalid service URL");}
 if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error("service URL must be HTTP(S) without credentials/query/hash");
 const prefix=(process.env.NEXUSFLOW_BASE_PATH??"/nexusflow").replace(/^\/+|\/+$/g,"");
 return new Client(prefix?`${root}/${prefix}`:root,process.env.NEXUSFLOW_TOKEN||"");
}
