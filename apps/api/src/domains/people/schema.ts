import { z } from "zod";
export const peopleSchema=z.object({
 name:z.string().min(1).max(128),
 org_id:z.string().min(1),
 title:z.string().max(64).optional(),
 employee_no:z.string().trim().max(64).nullable().optional(),
 management_level:z.string().max(64).nullable().optional(),
 professional_level:z.string().max(64).nullable().optional(),
 duties:z.array(z.string().max(64)).max(20).default([]),
 studio_ids:z.array(z.string().min(1).max(128)).max(50).default([]),
 status:z.enum(["active","travel","training","leave","unavailable","disabled"]).default("active"),
 daily_standard_hours:z.number().min(0).max(24).default(8),
 dispatchable:z.boolean().default(true),
 skills:z.array(z.string().max(64)).max(50).default([]),
}).passthrough();
