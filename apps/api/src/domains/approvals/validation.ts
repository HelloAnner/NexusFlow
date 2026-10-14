import type { User } from "../../permissions.ts";
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="approvals"&&["status","approver_id","step"].some(k=>k in patch))throw new Error("use approval actions to change workflow state");
}
