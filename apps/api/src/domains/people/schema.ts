import { z } from "zod";
export const peopleSchema=z.object({name:z.string().min(1).max(128),org_id:z.string().min(1),title:z.string().optional(),status:z.enum(["active","leave","travel","unavailable","disabled"]).default("active"),daily_standard_hours:z.number().min(0).max(24).default(8),skills:z.array(z.string()).default([])}).passthrough();
