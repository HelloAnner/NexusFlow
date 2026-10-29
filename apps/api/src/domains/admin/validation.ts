import type { User } from "../../permissions.ts";
import { z } from "zod";
export const userProfilePatch=z.object({
 display_name:z.string().trim().min(1).max(128).optional(),
 org_ids:z.array(z.string().trim().min(1).max(128)).max(50).optional(),
 updated_at:z.string().datetime().optional(),
}).strict().refine(p=>p.display_name!==undefined||p.org_ids!==undefined,{message:"display_name or org_ids required"});
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="invitations"||kind==="visibility_grants")throw new Error("use the dedicated revoke/grant action");
}
