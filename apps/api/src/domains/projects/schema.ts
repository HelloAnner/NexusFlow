import { z } from "zod";
export const projectsSchema=z.object({name:z.string().min(1).max(200),owner_id:z.string().min(1),org_id:z.string().min(1),visibility:z.enum(["normal","hidden","restricted"]).default("normal"),status:z.literal("planning").default("planning"),member_ids:z.array(z.string()).default([])}).passthrough();
export const visibility_grantsSchema=z.object({project_id:z.string().min(1),user_id:z.string().min(1),actions:z.array(z.enum(["view","edit"])).min(1),expires_at:z.string().datetime().optional()}).passthrough();
