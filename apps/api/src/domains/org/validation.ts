import { type User } from "../../permissions.ts";
import { orgExists } from "../../shared/record-relations.ts";
export async function validateOrgsCreate(user:User,data:Record<string,any>){
 if(data.parent_id&&!await orgExists(user,String(data.parent_id)))throw new Error("parent organization unavailable");
}
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="orgs"&&"parent_id" in patch&&!["super_admin","center_director"].includes(user.role))throw new Error("forbidden: organization structure management required");
}
export async function validateOrgParent(tx:any,tenantId:string|null,id:string,parentId:unknown){
 if(parentId===undefined||parentId===null)return;
 const rows=await tx`SELECT id,data FROM nexusflow.records WHERE kind='orgs' AND tenant_id IS NOT DISTINCT FROM ${tenantId} FOR KEY SHARE`;
 const parents=new Map<string,string>(rows.map((r:any)=>[String(r.id),String(r.data.parent_id||"")]));
 if(!parents.has(String(parentId)))throw new Error("parent organization unavailable");
 const seen=new Set([id]);
 let current=String(parentId);
 while(current){
  if(seen.has(current))throw new Error("organization cannot contain a parent cycle");
  seen.add(current);current=parents.get(current)||"";
 }
}
