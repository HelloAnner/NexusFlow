import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest, csvOption, parseJson } from "./shared";
export function adminRequest(args:CliArgs):CommandRequest|undefined {
 const {command,action,positionals:p}=args;
 if(command==="admin"&&action==="portal-links")return {path:"/api/admin/portal-file-links",method:"GET"};
 if(command==="admin"&&["portal-link","portal-unlink"].includes(action)){
  const portal_user_id=option(args,"portal-user-id"),portal_tenant_id=option(args,"portal-tenant-id"),reason=option(args,"reason");
  if(!portal_user_id||!portal_tenant_id||!reason||action==="portal-link"&&!p[0])throw Error("portal mapping requires --portal-user-id, --portal-tenant-id, --reason and local user ID for link");
  return {path:"/api/admin/portal-file-links",method:"PUT",body:{portal_user_id,portal_tenant_id,reason,status:action==="portal-link"?"active":"revoked",...(action==="portal-link"?{local_user_id:p[0]}:{})}};
 }
 if(command==="admin"&&action==="preflight")return {path:"/api/admin/preflight",method:"GET"};
 if(command==="admin"&&action==="audit")return {path:"/api/admin/audit",method:"GET"};
 if(command==="admin"&&action==="users")return {path:"/api/admin/users",method:"GET"};
 if(command==="admin"&&action==="delegations"){if(!p[0]||!option(args,"org-ids")||!option(args,"reason"))throw Error("admin delegations requires user ID, --org-ids CSV, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/delegations`,method:"PUT",body:{org_ids:option(args,"org-ids").split(",").map(x=>x.trim()).filter(Boolean),reason:option(args,"reason")}};}
 if(command==="admin"&&action==="user-status"){if(!p[0]||!option(args,"status")||!option(args,"reason"))throw Error("admin user-status requires ID, --status, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/status`,method:"PATCH",body:{status:option(args,"status"),reason:option(args,"reason")}};}
 if(command==="admin"&&action==="user-binding"){if(!p[0]||!option(args,"role")||!option(args,"reason"))throw Error("admin user-binding requires ID, --role, and --reason");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/binding`,method:"PATCH",body:{role:option(args,"role"),org_id:option(args,"org-id")||null,reason:option(args,"reason")}};}
 if(command==="admin"&&action==="user-profile"){
  if(!p[0])throw Error("admin user-profile requires user ID and either a JSON object or field flags");
  const body:Record<string,unknown>=p[1]?parseJson(p.slice(1).join(" ")):{};
  if(option(args,"name"))body.display_name=option(args,"name");
  if(typeof args.options["org-ids"]==="string"){const orgIds=csvOption(args,"org-ids");body.org_ids=orgIds?.length===1&&orgIds[0]==="none"?[]:orgIds;}
  if(typeof args.options["employee-no"]==="string")body.employee_no=option(args,"employee-no")||null;
  if(typeof args.options["management-level"]==="string")body.management_level=option(args,"management-level")||null;
  if(typeof args.options["professional-level"]==="string")body.professional_level=option(args,"professional-level")||null;
  if(typeof args.options["duties"]==="string")body.duties=csvOption(args,"duties");
  if(typeof args.options["skills"]==="string")body.skills=csvOption(args,"skills");
  if(typeof args.options["studio-ids"]==="string")body.studio_ids=csvOption(args,"studio-ids");
  if(option(args,"work-status"))body.work_status=option(args,"work-status");
  if(option(args,"daily-hours"))body.daily_standard_hours=Number(option(args,"daily-hours"));
  if(args.options["dispatchable"]===true)body.dispatchable=true;
  else if(typeof args.options["dispatchable"]==="string")body.dispatchable=option(args,"dispatchable")!=="false";
  if(option(args,"updated-at"))body.updated_at=option(args,"updated-at");
  if(!Object.keys(body).length)throw Error("admin user-profile requires a JSON object or at least one field flag");
  return {path:`/api/admin/users/${encodeURIComponent(p[0])}/profile`,method:"PATCH",body};
 }
 if(command==="admin"&&action==="user-projects"){if(!p[0])throw Error("admin user-projects requires user ID");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/projects`,method:"GET"};}
 if(command==="admin"&&action==="user-project"){
  if(!p[0]||!p[1]||!option(args,"role"))throw Error("admin user-project requires user ID, project ID, and --role");
  return {path:`/api/admin/users/${encodeURIComponent(p[0])}/projects/${encodeURIComponent(p[1])}`,method:"PUT",body:{project_role:option(args,"role"),responsibility:option(args,"responsibility"),...(option(args,"start-date")?{start_date:option(args,"start-date")}:{}),...(option(args,"end-date")?{end_date:option(args,"end-date")}:{})}};
 }
 if(command==="admin"&&action==="user-project-remove"){if(!p[0]||!p[1])throw Error("admin user-project-remove requires user ID and project ID");return {path:`/api/admin/users/${encodeURIComponent(p[0])}/projects/${encodeURIComponent(p[1])}`,method:"DELETE"};}
}
