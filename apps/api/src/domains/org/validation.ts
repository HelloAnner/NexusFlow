import { type User } from "../../permissions.ts";
import { orgExists } from "../../shared/record-relations.ts";
export async function validateOrgsCreate(user:User,data:Record<string,any>){
 const kind="orgs";
 if(kind==="orgs"){if(data.parent_id&&!await orgExists(user,String(data.parent_id)))throw new Error("parent organization unavailable");if(data.parent_id===data.id)throw new Error("organization cannot parent itself");}
}
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="orgs"&&"parent_id" in patch)throw new Error("organization moves require an admin workflow");
}
