import { z } from "zod";
export const approvalsSchema=z.object({dispatch_id:z.string().min(1),step:z.enum(["department_director","center_director","founder_confirmation"]),approver_id:z.string().min(1),status:z.enum(["pending","approved","rejected","cancelled"]).default("pending")}).passthrough();
