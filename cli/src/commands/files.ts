import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest, csvOption } from "./shared";
export function filesRequest(args:CliArgs):CommandRequest|undefined {
 const {command,action,positionals:p}=args;
 if(command==="files"&&action==="upload"){if(!p[0])throw Error("files upload requires local file path");if(!option(args,"category"))throw Error("files upload requires --category");return {path:"/api/files/upload",method:"POST",upload:p[0]};}
 if(command==="files"&&action==="rollback"){if(!p[0]||!option(args,"version-id")||!option(args,"reason"))throw Error("files rollback requires file ID, --version-id, and --reason");return {path:`/api/files/${encodeURIComponent(p[0])}/rollback`,method:"POST",body:{version_id:option(args,"version-id"),reason:option(args,"reason")}};}
 if(command==="files"&&action==="archive"){if(!p[0]||!option(args,"reason"))throw Error("files archive requires ID and --reason");return {path:`/api/files/${encodeURIComponent(p[0])}/archive`,method:"POST",body:{reason:option(args,"reason")}};}
 if(command==="files"&&action==="download"){ if(!p[0])throw Error("files download requires file ID");return {path:`/api/files/${encodeURIComponent(p[0])}/download`,method:"GET",download:option(args,"out")||`downloads/${p[0]}`};}
 if(command==="files"&&action==="versions"){if(!p[0])throw Error("files versions requires file ID");return {path:`/api/files/${encodeURIComponent(p[0])}/versions`,method:"GET"};}
}
