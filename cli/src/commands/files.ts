import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest, csvOption } from "./shared";
export function filesRequest(args:CliArgs):CommandRequest|undefined {
 const {command,action,positionals:p}=args;
 if(command==="files"&&action==="list"){
  const params=new URLSearchParams(),scope=option(args,"scope"),q=option(args,"q");
  if(Object.hasOwn(args.options,"scope")){if(scope!=="personal"&&scope!=="space")throw Error("files list --scope must be personal or space");params.set("scope",scope);}
  if(q)params.set("q",q);
  const qs=params.toString();
  return {path:`/api/files${qs?`?${qs}`:""}`,method:"GET"};
 }
 if(command==="files"&&action==="upload"){if(!p[0])throw Error("files upload requires local file path");if(!option(args,"category"))throw Error("files upload requires --category");const scope=option(args,"scope");if(Object.hasOwn(args.options,"scope")&&scope!=="personal"&&scope!=="space")throw Error("files upload --scope must be personal or space");return {path:"/api/files/upload",method:"POST",upload:p[0],...(scope?{scope}:{})};}
 if(command==="files"&&["portal-list","portal-content","portal-preview"].includes(action)){
  const user=option(args,"portal-user-id"),tenant=option(args,"portal-tenant-id"),token=option(args,"token")||process.env.PORTAL_INTERNAL_TOKEN||"";
  if(!user||!tenant)throw Error(`files ${action} requires --portal-user-id and --portal-tenant-id`);
  if(!token)throw Error("Portal service token required: set PORTAL_INTERNAL_TOKEN or pass --token");
  const headers={"x-portal-internal-token":token},identity=`portal_user_id=${encodeURIComponent(user)}&portal_tenant_id=${encodeURIComponent(tenant)}`;
  if(action==="portal-list"){
   const params=new URLSearchParams(identity),scope=option(args,"scope")||"personal",limit=option(args,"limit"),cursor=option(args,"cursor");
   if(scope!=="personal"&&scope!=="space")throw Error("files portal-list --scope must be personal or space");
   params.set("scope",scope);if(limit)params.set("limit",limit);if(cursor)params.set("cursor",cursor);
   return {path:`/api/portal/files?${params}`,method:"GET",headers};
  }
  if(!p[0])throw Error(`files ${action} requires file ID`);
  const operation=action==="portal-content"?"content":"preview";
  return {path:`/api/portal/files/${encodeURIComponent(p[0])}/${operation}?${identity}`,method:"GET",headers,download:option(args,"out")||`downloads/${p[0]}.${operation==="content"?"bin":"preview"}`};
 }
 if(command==="files"&&action==="rollback"){if(!p[0]||!option(args,"version-id")||!option(args,"reason"))throw Error("files rollback requires file ID, --version-id, and --reason");return {path:`/api/files/${encodeURIComponent(p[0])}/rollback`,method:"POST",body:{version_id:option(args,"version-id"),reason:option(args,"reason")}};}
 if(command==="files"&&action==="archive"){if(!p[0]||!option(args,"reason"))throw Error("files archive requires ID and --reason");return {path:`/api/files/${encodeURIComponent(p[0])}/archive`,method:"POST",body:{reason:option(args,"reason")}};}
 if(command==="files"&&action==="download"){ if(!p[0])throw Error("files download requires file ID");return {path:`/api/files/${encodeURIComponent(p[0])}/download`,method:"GET",download:option(args,"out")||`downloads/${p[0]}`};}
 if(command==="files"&&action==="versions"){if(!p[0])throw Error("files versions requires file ID");return {path:`/api/files/${encodeURIComponent(p[0])}/versions`,method:"GET"};}
}
