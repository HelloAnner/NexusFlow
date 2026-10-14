import { sql } from "../../db.ts";
import { canManage,canManageOrganization,canReadRecord,type User } from "../../permissions.ts";
import { buildDemoSeed } from "../../demo-seed.ts";
export async function preflight(user:User){
 if(!canManage(user))throw new Error("forbidden");
 if(!sql)throw new Error("DATABASE_URL required");
 const elevated=["super_admin","center_director"].includes(user.role);
 const rows=await sql`SELECT id,kind,tenant_id,created_by,data FROM nexusflow.records WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;
 const visible=[];
 for(const row of rows){if((row.kind==="seed"&&elevated)||await canReadRecord(user,String(row.kind),row as any))visible.push(row);}
 const accounts=await sql`SELECT id,username,org_id,portal_id,portal_tenant_id FROM nexusflow.users WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;
 const scopedAccounts=[];for(const row of accounts)if(elevated||row.org_id&&await canManageOrganization(user,String(row.org_id)))scopedAccounts.push(row);
 const counts:Record<string,number>={users:scopedAccounts.length};for(const row of visible)counts[row.kind]=(counts[row.kind]||0)+1;
 const plan=buildDemoSeed(),names=new Set([...plan.people,...plan.projects,...plan.tasks].map(x=>String(x.name)));
 const candidates=visible.filter(row=>row.kind==="seed"||row.data?.seed_key||names.has(String(row.data?.name||"")));
 const accountCandidates=scopedAccounts.filter(row=>String(row.username||"").toLowerCase().startsWith("demo."));
 const knownIds=new Set(rows.map(row=>String(row.id))),userIds=new Set(accounts.map(row=>String(row.id)));
 const brokenLinks=visible.filter(row=>["project_id","task_id","parent_id"].some(key=>row.data?.[key]&&!knownIds.has(String(row.data[key])))||["owner_id","user_id"].some(key=>row.data?.[key]&&!userIds.has(String(row.data[key])))).length;
 const warnings:{code:string;count:number;message:string}[]=[];
 const warn=(code:string,count:number,message:string)=>{if(count)warnings.push({code,count,message});};
 warn("demo_provenance_candidates",candidates.length,"Candidates only; names and seed_key do not establish ownership. No records are claimed or changed.");
 warn("demo_account_candidates",accountCandidates.length,"Username prefix is only a candidate signal; no account or credential is claimed or changed.");
 warn("legacy_seed_provenance",visible.filter(row=>row.kind==="seed"&&row.data?.provenance!=="isolated-demo-v1").length,"Legacy seed repair requires trusted provenance migration.");
 warn("missing_record_links",brokenLinks,"Visible records refer to missing same-tenant records/accounts.");
 warn("missing_account_org",scopedAccounts.filter(row=>!row.org_id).length,"Accounts have no organization binding.");
 warn("portal_tenant_binding",scopedAccounts.filter(row=>row.portal_id&&!row.portal_tenant_id).length,"Portal accounts need migration review.");
 const columns=await sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='nexusflow' AND table_name IN ('records','users','audit')`;
 const present=new Set(columns.map(row=>`${row.table_name}.${row.column_name}`));
 const required=["records.id","records.kind","records.tenant_id","records.created_by","records.data","records.updated_at","users.id","users.tenant_id","users.portal_tenant_id","audit.tenant_id","audit.data","audit.created_at"];
 warn("schema_migration_columns",required.filter(column=>!present.has(column)).length,"Required schema columns are missing; migration review is needed.");
 return {read_only:true,tenant_id:user.tenant_id,counts,warnings,provenance:{candidates:candidates.length,account_candidates:accountCandidates.length,ownership_verified:false},server_time:new Date().toISOString()};
}
