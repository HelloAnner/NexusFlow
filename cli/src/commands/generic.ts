import type { CliArgs } from "../args";
import { option } from "../args";
import { type CommandRequest, parseJson } from "./shared";
const domains=new Set(["orgs","people","projects","tasks","dispatch","approvals","load","conflicts","files","inbox","reports","tools","config","admin","invitations","visibility_grants","visibility-grants","gantt"]);
export function genericRequest(args:CliArgs):CommandRequest {
 const {command,action,positionals:p}=args;
 if(!domains.has(command))throw Error(`unknown command: ${command}`);
 let path=`/api/${command==="visibility-grants"?"visibility_grants":command}`,method="GET",body:unknown;
 if(action==="list"){const q=option(args,"q");if(command==="reports"&&p[0])path+=`/${encodeURIComponent(p[0])}`;else if(q)path+=`?q=${encodeURIComponent(q)}`;}
 else if(action==="show"){if(!p[0])throw Error(`${command} show requires ID`);path+=`/${encodeURIComponent(p[0])}`;}
 else if(action==="create"){const raw=p.join(" ");if(!raw)throw Error(`${command} create requires a JSON object`);body=parseJson(raw);method="POST";}
 else if(action==="update"){if(!p[0]||!p[1])throw Error(`${command} update requires ID and JSON object`);path+=`/${encodeURIComponent(p[0])}`;body=parseJson(p.slice(1).join(" "));method="PATCH";}
 else if(action==="delete"){if(!p[0])throw Error(`${command} delete requires ID`);path+=`/${encodeURIComponent(p[0])}`;method="DELETE";}
 else throw Error(`unsupported ${command} action: ${action}`);
 return {path,method,...(body!==undefined?{body}:{})};
}
