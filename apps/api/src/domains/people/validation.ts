import { type User } from "../../permissions.ts";
import { orgExists,orgKind,activeUsers } from "../../shared/record-relations.ts";
import { sql } from "../../db.ts";
import { dutyTags,managementLevels,professionalLevels } from "../../../../../packages/shared/src/index.ts";

function inList(list:readonly {value:string}[],value:unknown){return typeof value==="string"&&list.some(x=>x.value===value);}

export async function validatePeopleCreate(user:User,data:Record<string,any>){
 if(!await orgExists(user,String(data.org_id||"")))throw new Error("organization unavailable");
 if(data.user_id){const linked=await activeUsers(user,[String(data.user_id)]);if(linked[0]?.org_id!==data.org_id)throw new Error("person and account organization must match");}
 for(const id of data.studio_ids??[]){if(await orgKind(user,String(id))!=="studio")throw new Error("studio organization required");}
 if(data.management_level&&!inList(managementLevels,data.management_level))throw new Error("invalid management level");
 if(data.professional_level&&!inList(professionalLevels,data.professional_level))throw new Error("invalid professional level");
 for(const duty of data.duties??[])if(!inList(dutyTags,duty))throw new Error("invalid duty tag");
 if(data.employee_no){
  if(!sql)throw new Error("DATABASE_URL required");
  const duplicate=await sql`SELECT 1 FROM nexusflow.records WHERE kind='people' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'employee_no'=${String(data.employee_no)} LIMIT 1`;
  if(duplicate.length)throw new Error("employee number already exists");
 }
}

export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="people"&&["org_id","user_id","role"].some(k=>k in patch))throw new Error("account and organization binding requires an admin workflow");
}
