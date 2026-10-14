import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest, csvOption } from "./shared";
export function adminRequest(args:CliArgs):CommandRequest|undefined {
 const {command,action,positionals:p}=args;
 if(command==="admin"&&action==="preflight")return {path:"/api/admin/preflight",method:"GET"};
 if(command==="admin"&&action==="audit")return {path:"/api/admin/audit",method:"GET"};
 if(command==="admin"&&action==="users")return {path:"/api/admin/users",method:"GET"};
 if(command==="admin"&&action==="delegations"){if(!p[0]||!option(args,"org-ids")||!option(args,"reason"))throw Error("admin delegations requires user ID, --org-ids CSV, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/delegations`,method:"PUT",body:{org_ids:option(args,"org-ids").split(",").map(x=>x.trim()).filter(Boolean),reason:option(args,"reason")}};}
 if(command==="admin"&&action==="user-status"){if(!p[0]||!option(args,"status")||!option(args,"reason"))throw Error("admin user-status requires ID, --status, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/status`,method:"PATCH",body:{status:option(args,"status"),reason:option(args,"reason")}};}
 if(command==="admin"&&action==="user-binding"){if(!p[0]||!option(args,"role")||!option(args,"reason"))throw Error("admin user-binding requires ID, --role, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/binding`,method:"PATCH",body:{role:option(args,"role"),org_id:option(args,"org-id")||null,reason:option(args,"reason")}};}
}
