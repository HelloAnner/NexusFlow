import { z } from "zod";
export const configSchema=z.object({key:z.literal("task_types"),value:z.object({types:z.array(z.string().regex(/^[a-z0-9-]{2,64}$/)).min(1).max(40)}),status:z.enum(["draft","published","superseded"]).default("draft"),version:z.number().int().nonnegative().default(0)}).passthrough();
