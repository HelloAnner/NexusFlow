import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest, csvOption } from "./shared";
export function planningRequest(args:CliArgs):CommandRequest|undefined {
 const {command,action,positionals:p}=args;
 if(command==="gantt"){if(action==="summary")return {path:"/api/gantt/summary",method:"GET"};const query=new URLSearchParams();for(const k of ["project-id","owner-id","org-id","status","start","end","risk-only"])if(option(args,k))query.set(k.replaceAll("-","_"),option(args,k));return {path:`/api/gantt${query.size?`?${query}`:""}`,method:"GET"};}
 if(command==="load"&&action==="conflicts")return {path:"/api/load/conflicts",method:"GET"};
 if(command==="load"&&action==="list"){const query=new URLSearchParams();for(const k of ["date","org-id","person-id"])if(option(args,k))query.set(k.replaceAll("-","_"),option(args,k));return {path:`/api/load${query.size?`?${query}`:``}`,method:"GET"};}
 if(command==="load"&&action==="person"){if(!p[0])throw Error("load person requires person ID");const date=option(args,"date");return {path:`/api/load/${encodeURIComponent(p[0])}${date?`?date=${encodeURIComponent(date)}`:""}`,method:"GET"};}
 if(command==="dispatch"&&action==="submit"){ if(!p[0])throw Error("dispatch submit requires dispatch ID");return {path:`/api/dispatch/${encodeURIComponent(p[0])}/submit`,method:"POST",body:{}};}
 if(command==="dispatch"&&action==="confirm"){if(!p[0])throw Error("dispatch confirm requires dispatch ID");return {path:`/api/dispatch/${encodeURIComponent(p[0])}/confirm`,method:"POST",body:{}};}
 if(command==="approvals"&&action==="decision"){if(!p[0])throw Error("approvals decision requires approval ID");const approved=option(args,"approved");if(!["true","false"].includes(approved))throw Error("--approved true|false is required");return {path:`/api/approvals/${encodeURIComponent(p[0])}/decision`,method:"POST",body:{approved:approved==="true",reason:option(args,"reason")}};}
 if(command==="conflicts"&&(action==="resolve"||action==="force")){if(!p[0])throw Error(`conflicts ${action} requires conflict ID`);const reason=option(args,"reason");if(!reason)throw Error("--reason is required");return {path:`/api/conflicts/${encodeURIComponent(p[0])}/${action}`,method:"POST",body:{reason}};}
}
