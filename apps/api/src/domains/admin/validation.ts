import type { User } from "../../permissions.ts";
import { z } from "zod";
const personStatuses=["active","travel","training","leave","unavailable","disabled"] as const;
export const userProfilePatch=z.object({
 display_name:z.string().trim().min(1).max(128).optional(),
 org_ids:z.array(z.string().trim().min(1).max(128)).max(50).optional(),
 updated_at:z.string().datetime().optional(),
 employee_no:z.string().trim().max(64).nullable().optional(),
 management_level:z.string().max(64).nullable().optional(),
 professional_level:z.string().max(64).nullable().optional(),
 duties:z.array(z.string().max(64)).max(20).optional(),
 skills:z.array(z.string().max(64)).max(50).optional(),
 studio_ids:z.array(z.string().trim().min(1).max(128)).max(50).optional(),
 work_status:z.enum(personStatuses).optional(),
 daily_standard_hours:z.number().min(0).max(24).optional(),
 dispatchable:z.boolean().optional(),
}).strict().refine(p=>["display_name","org_ids","employee_no","management_level","professional_level","duties","skills","studio_ids","work_status","daily_standard_hours","dispatchable"].some(k=>k in p),{message:"profile field required"});
export function guardPatch(user:User,kind:string,patch:Record<string,unknown>){
 if(kind==="invitations"||kind==="visibility_grants")throw new Error("use the dedicated revoke/grant action");
}
