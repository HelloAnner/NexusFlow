import { type User } from "../../permissions.ts";
import { orgExists,activeUsers } from "../../shared/record-relations.ts";
export async function validatePeopleCreate(user:User,data:Record<string,any>){
 const kind="people";
 if(kind==="people"){if(!await orgExists(user,String(data.org_id||"")))throw new Error("organization unavailable");if(data.user_id){const linked=await activeUsers(user,[String(data.user_id)]);if(linked[0]?.org_id!==data.org_id)throw new Error("person and account organization must match");}}
}
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="people"&&["org_id","user_id","role"].some(k=>k in patch))throw new Error("account and organization binding requires an admin workflow");
}
