import type { CliArgs } from "./args";
import { option } from "./args";
export interface CommandRequest { path:string; method:string; body?:unknown; upload?:string; download?:string }
const domains=new Set(["orgs","people","projects","tasks","dispatch","approvals","load","conflicts","files","inbox","reports","tools","config","admin","invitations","gantt"]);
export function commandRequest(args:CliArgs):CommandRequest {
 const {command,action,positionals:p}=args;
 if(command==="org")return {path:action==="tree"?"/api/orgs/tree":"/api/orgs",method:"GET"};
 if(command==="health")return {path:action==="ready"?"/readyz":"/healthz",method:"GET"};
 if(command==="home")return {path:"/api/home",method:"GET"};
 if(command==="auth"&&action==="me")return {path:"/api/auth/me",method:"GET"};
 if(command==="gantt"){if(action==="summary")return {path:"/api/gantt/summary",method:"GET"};const query=new URLSearchParams();for(const k of ["project-id","owner-id","org-id","status","start","end","risk-only"])if(option(args,k))query.set(k.replaceAll("-","_"),option(args,k));return {path:`/api/gantt${query.size?`?${query}`:""}`,method:"GET"};}
 if(command==="auth"&&action==="register"){const body={username:option(args,"username"),display_name:option(args,"display-name"),password:option(args,"password"),invitation_token:option(args,"invitation-token")};if(Object.values(body).some(x=>!x))throw Error("auth register requires --username, --display-name, --password, and --invitation-token");return {path:"/api/auth/register",method:"POST",body};}
 if(command==="auth"&&action==="logout")return {path:"/api/auth/logout",method:"POST",body:{}};
 if(command==="seed")return action==="status"?{path:"/api/seed/status",method:"GET"}:{path:"/api/seed",method:"POST",body:{}};
 if(command==="admin"&&action==="audit")return {path:"/api/admin/audit",method:"GET"};
 if(command==="admin"&&action==="users")return {path:"/api/admin/users",method:"GET"};
 if(command==="admin"&&action==="user-status"){if(!p[0]||!option(args,"status")||!option(args,"reason"))throw Error("admin user-status requires ID, --status, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/status`,method:"PATCH",body:{status:option(args,"status"),reason:option(args,"reason")}};}
 if(command==="admin"&&action==="user-binding"){if(!p[0]||!option(args,"role")||!option(args,"reason"))throw Error("admin user-binding requires ID, --role, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/binding`,method:"PATCH",body:{role:option(args,"role"),org_id:option(args,"org-id")||null,reason:option(args,"reason")}};}
 if(command==="load"&&action==="conflicts")return {path:"/api/load/conflicts",method:"GET"};
 if(command==="load"&&action==="person"){if(!p[0])throw Error("load person requires person ID");const date=option(args,"date");return {path:`/api/load/${encodeURIComponent(p[0])}${date?`?date=${encodeURIComponent(date)}`:""}`,method:"GET"};}
 if(command==="orgs"&&action==="tree")return {path:"/api/orgs/tree",method:"GET"};
 if(command==="people"&&action==="load"){if(!p[0])throw Error("people load requires person ID");const date=option(args,"date");return {path:`/api/load/${encodeURIComponent(p[0])}${date?`?date=${encodeURIComponent(date)}`:""}`,method:"GET"};}
 if(command==="tasks"&&action==="publish"){if(!p[0])throw Error("tasks publish requires task ID");return {path:`/api/tasks/${encodeURIComponent(p[0])}/publish`,method:"POST",body:{}};}
 if(command==="tasks"&&action==="action"){if(!p[0]||!option(args,"action"))throw Error("tasks action requires ID and --action");const body:Record<string,unknown>={action:option(args,"action")};for(const k of ["progress","hours","note","reason","start-date","end-date","daily-hours","all-day"])if(args.options[k]!==undefined){const value=option(args,k);body[k.replaceAll("-","_")]=k==="all-day"?value==="true":value;}return {path:`/api/tasks/${encodeURIComponent(p[0])}/action`,method:"POST",body};}
 if(command==="dispatch"&&action==="submit"){ if(!p[0])throw Error("dispatch submit requires dispatch ID");return {path:`/api/dispatch/${encodeURIComponent(p[0])}/submit`,method:"POST",body:{}};}
 if(command==="dispatch"&&action==="confirm"){if(!p[0])throw Error("dispatch confirm requires dispatch ID");return {path:`/api/dispatch/${encodeURIComponent(p[0])}/confirm`,method:"POST",body:{}};}
 if(command==="approvals"&&action==="decision"){if(!p[0])throw Error("approvals decision requires approval ID");const approved=option(args,"approved");if(!["true","false"].includes(approved))throw Error("--approved true|false is required");return {path:`/api/approvals/${encodeURIComponent(p[0])}/decision`,method:"POST",body:{approved:approved==="true",reason:option(args,"reason")}};}
 if(command==="conflicts"&&(action==="resolve"||action==="force")){if(!p[0])throw Error(`conflicts ${action} requires conflict ID`);const reason=option(args,"reason");if(!reason)throw Error("--reason is required");return {path:`/api/conflicts/${encodeURIComponent(p[0])}/${action}`,method:"POST",body:{reason}};}
 if(command==="files"&&action==="upload"){if(!p[0])throw Error("files upload requires local file path");if(!option(args,"category"))throw Error("files upload requires --category");return {path:"/api/files/upload",method:"POST",upload:p[0]};}
 if(command==="files"&&action==="archive"){if(!p[0]||!option(args,"reason"))throw Error("files archive requires ID and --reason");return {path:`/api/files/${encodeURIComponent(p[0])}/archive`,method:"POST",body:{reason:option(args,"reason")}};}
 if(command==="files"&&action==="download"){ if(!p[0])throw Error("files download requires file ID");return {path:`/api/files/${encodeURIComponent(p[0])}/download`,method:"GET",download:option(args,"out")||p[0]};}
 if(command==="reports"&&action==="export"){if(!p[0])throw Error("reports export requires report type");const query=new URLSearchParams();for(const k of ["from","to","date"])if(option(args,k))query.set(k,option(args,k));return {path:`/api/reports/${encodeURIComponent(p[0])}/export${query.size?`?${query}`:""}`,method:"POST",body:{},download:option(args,"out")||undefined};}
 if(command==="invitations"&&action==="revoke"){if(!p[0])throw Error("invitations revoke requires ID");return {path:`/api/invitations/${encodeURIComponent(p[0])}/revoke`,method:"POST",body:{}};}
 if(command==="inbox"&&(action==="read"||action==="complete")){if(!p[0])throw Error(`inbox ${action} requires item ID`);return {path:`/api/inbox/${encodeURIComponent(p[0])}/${action}`,method:"POST",body:{reason:option(args,"reason")}};}
 if(command==="config"&&action==="publish"){if(!p[0])throw Error("config publish requires config ID");return {path:`/api/config/${encodeURIComponent(p[0])}/publish`,method:"POST",body:{reason:option(args,"reason")}};}
 if(command==="config"&&action==="versions"){if(!p[0])throw Error("config versions requires config ID");return {path:`/api/config/${encodeURIComponent(p[0])}/versions`,method:"GET"};}
 if(command==="files"&&action==="versions"){if(!p[0])throw Error("files versions requires file ID");return {path:`/api/files/${encodeURIComponent(p[0])}/versions`,method:"GET"};}
 if(!domains.has(command))throw Error(`unknown command: ${command}`);
 let path=`/api/${command}`,method="GET",body:unknown;
 if(action==="list"){const q=option(args,"q");if(command==="reports"&&p[0])path+=`/${encodeURIComponent(p[0])}`;else if(q)path+=`?q=${encodeURIComponent(q)}`;}
 else if(action==="show"){if(!p[0])throw Error(`${command} show requires ID`);path+=`/${encodeURIComponent(p[0])}`;}
 else if(action==="create"){const raw=p.join(" ");if(!raw)throw Error(`${command} create requires a JSON object`);body=parseJson(raw);method="POST";}
 else if(action==="update"){if(!p[0]||!p[1])throw Error(`${command} update requires ID and JSON object`);path+=`/${encodeURIComponent(p[0])}`;body=parseJson(p.slice(1).join(" "));method="PATCH";}
 else if(action==="delete"){if(!p[0])throw Error(`${command} delete requires ID`);path+=`/${encodeURIComponent(p[0])}`;method="DELETE";}
 else throw Error(`unsupported ${command} action: ${action}`);
 return {path,method,...(body!==undefined?{body}:{})};
}
function parseJson(value:string){try{const result=JSON.parse(value);if(!result||typeof result!=="object"||Array.isArray(result))throw Error();return result;}catch{throw Error("expected a JSON object");}}
