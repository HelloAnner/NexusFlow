import { z } from "zod";
import { fileCategories } from "../../../../../packages/shared/src/index.ts";
export const filesSchema=z.object({name:z.string().min(1).max(255),category:z.enum(fileCategories),object_key:z.string().min(1),content_type:z.string().optional(),size_bytes:z.number().int().nonnegative(),project_id:z.string().optional(),task_id:z.string().optional(),status:z.enum(["active","archived","deleted"]).default("active")}).passthrough();
