import type { User } from "../../permissions.ts";
import { canManage } from "../../permissions.ts";
import { actor } from "../../permissions.ts";
import { listRecords,getRecord } from "../../records.ts";
export async function orgTree(user:ReturnType<typeof actor>){const items=await listRecords(user,"orgs");const nodes=new Map(items.map(item=>[String(item.id),{...item,children:[] as any[]}]));const roots:any[]=[];for(const item of items){const node=nodes.get(String(item.id))!;const parent=nodes.get(String(item.parent_id||""));if(parent)parent.children.push(node);else roots.push(node);}return Response.json({items:roots});}

export async function orgExists(user:User,id:string){return Boolean(await getRecord(user,"orgs",id));}

export async function orgDescendant(user:User,child:string,parent:string){if(child===parent)return true;const orgs=await listRecords(user,"orgs"),parents=new Map(orgs.map(o=>[String(o.id),String(o.parent_id||"")]));let current=child;for(let i=0;i<64&&current;i++){current=parents.get(current)||"";if(current===parent)return true;}return false;}

export async function assignmentOrgAllowed(user:User,personOrg:string|null,targetOrg:string,accountId:string){if(!personOrg)return user.role==="super_admin"&&accountId===user.id;if(await orgDescendant(user,personOrg,targetOrg))return true;return canManage(user)&&await orgDescendant(user,targetOrg,personOrg);}
