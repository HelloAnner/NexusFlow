import type { User } from "../../permissions.ts";
import { sql } from "../../db.ts";
function db(){if(!sql)throw new Error("DATABASE_URL required");return sql;}

export async function activeUsers(user:User,ids:string[]){const found:Record<string,any>[]=[];for(const id of [...new Set(ids)]){const rows=await db()`SELECT id,org_id,status FROM nexusflow.users WHERE id=${id} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;if(!rows[0]||rows[0].status!=="active")throw new Error(`active same-tenant user required: ${id}`);found.push(rows[0]);}return found;}
