import type { User } from "../../permissions.ts";
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="invitations"||kind==="visibility_grants")throw new Error("use the dedicated revoke/grant action");
}
