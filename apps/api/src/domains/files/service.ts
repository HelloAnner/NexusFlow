import { actor } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { insertRecord } from "../../records.ts";
import { objectRequest } from "../../storage.ts";
export async function queueObjectCleanup(user:ReturnType<typeof actor>,key:string){if(!sql)return;await sql.begin(async tx=>{await insertRecord(tx,user,"storage_cleanup",{object_key:key,status:"pending",attempts:0,created_at:new Date().toISOString()});});}
export async function retryObjectCleanup(){if(!sql)return;const rows=await sql`SELECT id,tenant_id,created_by,data FROM nexusflow.records WHERE kind='storage_cleanup' AND data->>'status'='pending' ORDER BY created_at LIMIT 20`;for(const row of rows){const task=row.data as any;try{await objectRequest("DELETE",String(task.object_key));await sql`UPDATE nexusflow.records SET data=data||${sql.json({status:"done",completed_at:new Date().toISOString()} as any)},updated_at=now() WHERE id=${row.id} AND kind='storage_cleanup'`;}catch{await sql`UPDATE nexusflow.records SET data=data||${sql.json({attempts:Number(task.attempts||0)+1,last_attempt_at:new Date().toISOString()} as any)},updated_at=now() WHERE id=${row.id} AND kind='storage_cleanup'`;}}}
