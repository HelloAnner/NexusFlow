import { z } from "zod";
export const dispatchSchema=z.object({task_id:z.string().min(1),requester_id:z.string().min(1),workflow:z.enum(["standard","supplemental"]),status:z.literal("draft").default("draft"),target_org_ids:z.array(z.string()).default([])}).passthrough();
