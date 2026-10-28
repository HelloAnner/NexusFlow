import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest } from "./shared";
export function systemRequest(args:CliArgs):CommandRequest|undefined {
 const {command,action,positionals:p}=args;
 if(command==="version")return {path:"/api/system/version",method:"GET"};
 if(command==="org")return {path:action==="tree"?"/api/orgs/tree":"/api/orgs",method:"GET"};
 if(command==="health")return {path:action==="ready"?"/readyz":"/healthz",method:"GET"};
 if(command==="home")return {path:"/api/home",method:"GET"};
 if(command==="auth"&&action==="me")return {path:"/api/auth/me",method:"GET"};
 if(command==="auth"&&action==="rename"){const display_name=option(args,"display-name");if(!display_name)throw Error("auth rename requires --display-name");return {path:"/api/auth/me",method:"PATCH",body:{display_name}};}
 if(command==="auth"&&action==="passwd"){const old_password=option(args,"old-password"),new_password=option(args,"new-password");if(!old_password||!new_password)throw Error("auth passwd requires --old-password and --new-password");return {path:"/api/auth/password",method:"POST",body:{old_password,new_password}};}
 if(command==="auth"&&action==="register"){const body={username:option(args,"username"),display_name:option(args,"display-name"),password:option(args,"password"),invitation_token:option(args,"invitation-token")};if(Object.values(body).some(x=>!x))throw Error("auth register requires --username, --display-name, --password, and --invitation-token");return {path:"/api/auth/register",method:"POST",body};}
 if(command==="auth"&&action==="logout")return {path:"/api/auth/logout",method:"POST",body:{}};
 if(command==="seed")return action==="status"?{path:"/api/seed/status",method:"GET"}:{path:"/api/seed",method:"POST",body:{}};
}
