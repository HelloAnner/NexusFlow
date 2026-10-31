import { type User } from "../../permissions.ts";
import { orgKind } from "../../shared/record-relations.ts";
import { orgTypeOrder, orgParentAllowed } from "../../../../../packages/shared/src/index.ts";

export { orgParentAllowed };

export async function validateOrgsCreate(user:User,data:Record<string,any>){
 const type=String(data.type||""),parentId=data.parent_id?String(data.parent_id):null;
 if(!(type in orgTypeOrder))throw new Error("invalid organization type");
 if(parentId){
  const parent=await orgKind(user,parentId);
  if(!parent)throw new Error("parent organization unavailable");
  if(!orgParentAllowed(type,parent))throw new Error("organization hierarchy must be company > second level > center > department; studios belong to a center or department");
 }else if(!orgParentAllowed(type,null))throw new Error("invalid organization hierarchy: only a company can be a root");
}

export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="orgs"&&"parent_id" in patch&&!["super_admin","center_director"].includes(user.role))throw new Error("forbidden: organization structure management required");
}

export async function validateOrgParent(tx:any,tenantId:string|null,id:string,parentId:unknown,type?:unknown){
 const rows=await tx`SELECT id,data FROM nexusflow.records WHERE kind='orgs' AND tenant_id IS NOT DISTINCT FROM ${tenantId} FOR KEY SHARE`;
 const nodes=new Map<string,{parent:string;type:string}>(rows.map((r:any)=>[String(r.id),{parent:String((r.data as any).parent_id||""),type:String((r.data as any).type||"")}]));
 const node=nodes.get(id);
 const effectiveType=type===undefined?String(node?.type||""):String(type);
 const parent=parentId===undefined||parentId===null||parentId===""?"":String(parentId);
 if(parent){
  const parentType=nodes.get(parent)?.type;
  if(!parentType)throw new Error("parent organization unavailable");
  if(!orgParentAllowed(effectiveType,parentType))throw new Error("organization hierarchy must be company > second level > center > department; studios belong to a center or department");
 }else if(!orgParentAllowed(effectiveType,null))throw new Error("invalid organization hierarchy: only a company can be a root");
 const seen=new Set([id]);
 let current=parent;
 while(current){
  if(seen.has(current))throw new Error("organization cannot contain a parent cycle");
  seen.add(current);current=nodes.get(current)?.parent||"";
 }
}
