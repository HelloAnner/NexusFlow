import type { User } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { taskTypes } from "../../../../../packages/shared/src/index.ts";
const types:readonly string[]=taskTypes;
function db(){if(!sql)throw new Error("DATABASE_URL required");return sql;}

export async function allowedTaskTypes(user:User){const rows=await db()`SELECT data FROM nexusflow.records WHERE kind='config' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'key'='task_types' AND data->>'status'='published' ORDER BY updated_at DESC LIMIT 1`;const value=(rows[0]?.data as any)?.value?.types;return Array.isArray(value)&&value.every((x:any)=>typeof x==='string')?value:types;}
