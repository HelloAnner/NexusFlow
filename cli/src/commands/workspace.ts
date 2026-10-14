import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest, csvOption } from "./shared";
export function workspaceRequest(args:CliArgs):CommandRequest|undefined {
 const {command,action,positionals:p}=args;
 if(command==="orgs"&&action==="tree")return {path:"/api/orgs/tree",method:"GET"};
 if(command==="people"&&action==="load"){if(!p[0])throw Error("people load requires person ID");const date=option(args,"date");return {path:`/api/load/${encodeURIComponent(p[0])}${date?`?date=${encodeURIComponent(date)}`:""}`,method:"GET"};}
 if(command==="reports"&&action==="export"){if(!p[0])throw Error("reports export requires report type");const query=new URLSearchParams();for(const k of ["from","to","date"])if(option(args,k))query.set(k,option(args,k));return {path:`/api/reports/${encodeURIComponent(p[0])}/export${query.size?`?${query}`:""}`,method:"POST",body:{},download:option(args,"out")||undefined};}
 if(command==="invitations"&&action==="revoke"){if(!p[0])throw Error("invitations revoke requires ID");return {path:`/api/invitations/${encodeURIComponent(p[0])}/revoke`,method:"POST",body:{}};}
 if(command==="inbox"&&(action==="read"||action==="complete")){if(!p[0])throw Error(`inbox ${action} requires item ID`);return {path:`/api/inbox/${encodeURIComponent(p[0])}/${action}`,method:"POST",body:{reason:option(args,"reason")}};}
 if(command==="config"&&action==="publish"){if(!p[0])throw Error("config publish requires config ID");return {path:`/api/config/${encodeURIComponent(p[0])}/publish`,method:"POST",body:{reason:option(args,"reason")}};}
 if(command==="config"&&action==="versions"){if(!p[0])throw Error("config versions requires config ID");return {path:`/api/config/${encodeURIComponent(p[0])}/versions`,method:"GET"};}
}
