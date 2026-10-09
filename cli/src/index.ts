#!/usr/bin/env bun
import { parseArgs,option } from "./args";
import { commandRequest } from "./commands";

export async function main(argv=process.argv.slice(2)) {
 const args=parseArgs(argv);if(!args.command||args.command==="help"||args.options.help===true){help();return 0;}
 const root=(process.env.NEXUSFLOW_URL||"http://127.0.0.1:8089").replace(/\/+$/,"");const prefix=(process.env.NEXUSFLOW_BASE_PATH||"/nexusflow").replace(/^\/+|\/+$/g,"");const base=prefix?`${root}/${prefix}`:root;
 if(args.command==="auth"&&args.action==="login")return login(base);
 const request=commandRequest(args);const url=base+request.path;const headers=new Headers({accept:"application/json"});const token=process.env.NEXUSFLOW_TOKEN;if(token)headers.set("authorization",`Bearer ${token}`);
 let body:BodyInit|undefined;
 if(request.upload){const file=await Bun.file(request.upload).exists().then(ok=>ok?Bun.file(request.upload!):null);if(!file)throw Error(`file not found: ${request.upload}`);const form=new FormData();form.set("file",file,file.name);form.set("category",option(args,"category"));for(const k of ["task-id","project-id"])if(option(args,k))form.set(k.replace("-","_"),option(args,k));body=form;}
 else if(request.body!==undefined){headers.set("content-type","application/json");body=JSON.stringify(request.body);}
 const response=await fetch(url,{method:request.method,headers,body,signal:AbortSignal.timeout(30000)});
 if(request.download){if(!response.ok)throw Error(`${response.status}: ${await response.text()}`);await Bun.write(request.download,response);console.log(`downloaded ${request.download}`);return 0;}
 const text=await response.text();if(!response.ok)throw Error(`${response.status}: ${text}`);let result:unknown=text;try{result=JSON.parse(text);}catch{}console.log(args.options.json===true?JSON.stringify(result):JSON.stringify(result,null,2));return 0;
}
async function login(base:string){const username=process.env.NEXUSFLOW_USER||prompt("Username: ")||"";const password=process.env.NEXUSFLOW_PASSWORD||prompt("Password: ")||"";const response=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,password})});const text=await response.text();if(!response.ok)throw Error(`${response.status}: ${text}`);const result=JSON.parse(text) as {access_token:string};console.log(`export NEXUSFLOW_TOKEN='${result.access_token}'`);return 0;}
function help(){console.log(`nexusflow <auth login|register|logout|home|gantt|orgs|people|projects|tasks|dispatch|approvals|load|conflicts|files|inbox|reports|tools|config|admin> <action>\nActions: list/show/create/update/delete; tasks assign|assignments|publish|action; task-assignments list|show|update|requirements|action; visibility_grants create|list|show, visibility-grants revoke; dispatch submit|confirm; approvals decision; conflicts resolve|force; files upload|download|rollback|versions; reports export; inbox read|complete; config publish|versions; admin audit|delegations; health; seed\nSet NEXUSFLOW_URL, NEXUSFLOW_BASE_PATH, NEXUSFLOW_TOKEN. Use --json for compact JSON.`);}
if(import.meta.main)main().catch(e=>{console.error(`nexusflow: ${e instanceof Error?e.message:String(e)}`);process.exitCode=1});
