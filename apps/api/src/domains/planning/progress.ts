import { z } from 'zod';
import { sql } from '../../db.ts';
import { getRecord,insertRecord } from '../../records.ts';
import type { User } from '../../permissions.ts';
import { addAudit } from '../../shared/audit.ts';
import { today } from './service.ts';
export async function reportAssignment(user:User,assignment:Record<string,any>,task:Record<string,any>,raw:Record<string,any>){
 const {action:_action,...input}=raw,body=z.object({progress:z.number().min(0).max(100),hours:z.number().min(0).max(24).default(0),note:z.string().max(4000).default(''),date:z.string().date().default(today())}).strict().parse(input);
 if(assignment.user_id!==user.id||assignment.status!=='active'||task.status!=='in_progress')throw Error('forbidden: only your active assignment can be reported');
 if(body.date<assignment.start_date||body.date>assignment.end_date||body.date>today())throw Error('invalid worklog date outside active assignment');
 if(!sql)throw Error('DATABASE_URL required');
 await sql.begin(async tx=>{
  const rows=await tx`SELECT data FROM nexusflow.records WHERE id=${assignment.id} AND kind='task_assignments' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;if(!rows[0]||(rows[0].data as any).status!=='active')throw Error('assignment changed; retry');
  await tx`UPDATE nexusflow.records SET data=data||${tx.json({progress:body.progress,progress_note:body.note} as any)},updated_at=now() WHERE id=${assignment.id}`;
  if(body.hours>0)await insertRecord(tx,user,'worklogs',{task_id:task.id,assignment_id:assignment.id,person_id:user.id,date:body.date,hours:body.hours,note:body.note,status:'reported'});
  const all=await tx`SELECT data FROM nexusflow.records WHERE kind='task_assignments' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'task_id'=${String(task.id)} AND data->>'status' NOT IN ('cancelled','rejected')`,weighted=all.map(r=>r.data as any),weight=weighted.reduce((n,a)=>n+Number(a.daily_hours||1),0),progress=weight?Math.round(weighted.reduce((n,a)=>n+Number(a.progress||0)*Number(a.daily_hours||1),0)/weight):0;
  await tx`UPDATE nexusflow.records SET data=data||${tx.json({progress,progress_source:'assignment_daily_hours_weighted'} as any)},updated_at=now() WHERE id=${task.id}`;
  await addAudit(tx,user,'task_assignment.report','task_assignments',String(assignment.id),{before:{progress:assignment.progress},after:body});
 });return getRecord(user,'task_assignments',String(assignment.id));
}
