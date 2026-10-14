import { canManage,type User } from "../../permissions.ts";
export async function validateConfigCreate(user:User,data:Record<string,any>){
 const kind="config";
 if(kind==="config"&&(!canManage(user)||data.status!=="draft"))throw new Error("forbidden: configuration drafts require an administrator");
}
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="config"&&"status" in patch)throw new Error("use config publish action to change activation state");
}
