import type { User } from "../../permissions.ts";
import { sql } from "../../db.ts";
function db(){if(!sql)throw new Error("DATABASE_URL required");return sql;}

export async function activeUsers(user:User,ids:string[]){const found:Record<string,any>[]=[];for(const id of [...new Set(ids)]){const rows=await db()`SELECT id,org_id,status FROM nexusflow.users WHERE id=${id} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(!rows[0]||rows[0].status!=="active")throw new Error(`active same-tenant user required: ${id}`);found.push(rows[0]);}return found;}

export async function assertAssignable(user:User,ids:string[]){
 const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return;
 const rows=await db()`SELECT data FROM nexusflow.records WHERE kind='people' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND (id = ANY(${unique}::text[]) OR data->>'user_id' = ANY(${unique}::text[]))`;
 for(const row of rows){const person=row.data as Record<string,any>,name=String(person.name||person.user_id||person.id||"");if(person.dispatchable===false)throw new Error(`person is not dispatchable: ${name}`);if(["leave","unavailable","disabled"].includes(String(person.status)))throw new Error(`person is unavailable: ${name}`);}
}
