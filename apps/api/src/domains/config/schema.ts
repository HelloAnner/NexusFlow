import { z } from 'zod';
const common={status:z.enum(['draft','published','superseded']).default('draft'),version:z.number().int().nonnegative().default(0)};
export const configSchema=z.discriminatedUnion('key',[
 z.object({...common,key:z.literal('task_types'),value:z.object({types:z.array(z.string().regex(/^[a-z0-9-]{2,64}$/)).min(1).max(40)})}).passthrough(),
 z.object({...common,key:z.literal('work_calendar'),value:z.object({weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),holidays:z.array(z.string().date()).max(1000).default([]),extra_workdays:z.array(z.string().date()).max(1000).default([])})}).passthrough(),
]);
