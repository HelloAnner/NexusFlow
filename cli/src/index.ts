#!/usr/bin/env bun
import { parseArgs,option } from "./args";
import { build,environmentClient } from "./client";
import { verifyB0 } from "./verify";
import { portalSync } from "./portal-sync";
import { checkBrand } from "./brand";
import { checkTheme } from "./theme";
import { permCommand, permText } from "./perm";

export async function main(argv=process.argv.slice(2)) {
 const args=parseArgs(argv);
 if(!args.command||args.command==="help"||args.options.help===true){help();return 0;}
 const client=environmentClient();let result:unknown;
 if(args.command==="version"&&args.options.local===true)result=build;
 else if(args.command==="verify") {
  if(!["b0","list"].includes(args.action))throw Error("verify only supports b0");
  result=await verifyB0(client,option(args,"commit",build.version),{username:process.env.NEXUSFLOW_USER||process.env.SUPER_ADMIN_USERNAME||"",password:process.env.NEXUSFLOW_PASSWORD||process.env.SUPER_ADMIN_PASSWORD||""});
 } else if(args.command==="auth"&&["login","register"].includes(args.action)) {
  const user=args.action==="login"
   ?await client.login(process.env.NEXUSFLOW_USER||prompt("Username: ")||"",process.env.NEXUSFLOW_PASSWORD||prompt("Password: ")||"")
   :await client.command(args);
  const file=option(args,"token-file");
  if(file){const {writeFile}=await import("node:fs/promises");await writeFile(file,client.token,{mode:0o600,flag:"wx"});}
  result={user,authenticated:true,...(file?{token_file:file}:{})};
 } else if(args.command==="brand") {
  if(args.action && args.action!=="check")throw Error("usage: nexusflow brand check");
  result=await checkBrand(client.base,"nexusflow");
 } else if(args.command==="theme") {
  if(args.action && args.action!=="check")throw Error("usage: nexusflow theme check");
  result=await checkTheme(client.base);
 } else if(args.command==="portal-sync") {
  result=await portalSync(client,args);
 } else if(args.command==="perm") {
  result=await permCommand(client,args);
  if(args.options.json===true) console.log(JSON.stringify(result));
  else console.log(permText(result,args.action||"catalog"));
  return 0;
 } else result=await client.command(args);
 console.log(args.options.json===true?JSON.stringify(result):JSON.stringify(result,null,2));return 0;
}
function help(){console.log(`nexusflow <auth|version|verify|home|gantt|orgs|people|projects|tasks|dispatch|approvals|load|conflicts|files|inbox|reports|tools|config|admin|perm|portal-sync|brand|theme> <action>
Actions: list/show/create/update/delete; auth login|register|logout|me|rename|passwd; tasks assign|assignments|publish|action; task-assignments list|show|update|requirements|action; visibility_grants create|list|show, visibility-grants revoke; dispatch submit|confirm; approvals decision; conflicts resolve|force; files upload|download|rollback|archive|versions|portal-list|portal-content|portal-preview; reports export; inbox read|complete; config publish|versions; admin preflight|audit|users|delegations|user-status|user-binding; perm catalog|subjects|matrix|set|reset|check|prune; health [ready]; seed [status]
brand check: verify SVG favicon, system identity and application base path.
theme check: verify the served build ships light/dark tokens and the no-flash theme script.
version: public service commit; version --local: compiled CLI commit.
verify b0 --commit SHA: read regression, temporary admin session; no seed or business writes.
Set NEXUSFLOW_URL, NEXUSFLOW_BASE_PATH, NEXUSFLOW_TOKEN. --json for compact JSON.
Portal read-only files: set PORTAL_INTERNAL_TOKEN (or --token) and pass --portal-user-id/--portal-tenant-id; files upload --scope personal|space.
portal-sync status|tenants|members --tenant-id ID|password --portal-user-id ID --password PW|selftest: exercise the internal sync endpoints with PORTAL_INTERNAL_TOKEN.
Login uses NEXUSFLOW_USER/PASSWORD; login/register --token-file PATH saves a private token without printing it.`);}
if(import.meta.main)main().catch(e=>{console.error(`nexusflow: ${e instanceof Error?e.message:"command failed"}`);process.exitCode=1});
