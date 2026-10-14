import { z } from "zod";
export const orgsSchema=z.object({name:z.string().min(1).max(128),type:z.enum(["company","second_level","center","department","studio"]),parent_id:z.string().nullable().optional(),enabled:z.boolean().default(true)}).passthrough();
