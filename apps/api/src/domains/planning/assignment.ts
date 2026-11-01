import { sql } from '../../db.ts';
import { getRecord } from '../../records.ts';
import { canEditTask,type User } from '../../permissions.ts';
import { activeUsers,assertAssignable } from '../people/service.ts';
import { assignmentOrgAllowed } from '../../shared/record-relations.ts';
import { addAudit } from '../../shared/audit.ts';
import { addInbox } from '../inbox/service.ts';
import { taskLoadEntries } from '../load/service.ts';
import { calculateDailyLoads,validDate } from '../../load.ts';
import { today } from './service.ts';
export async function changeAssignment(user:User,assignment:Record<string,any>,task:Record<string,any>,action:string,body:Record<string,any>){
 if(!sql)throw Error('DATABASE_URL required');if(!await canEditTask(user,task))throw Error('forbidden: task edit permission required');
 if(!['draft','in_progress','paused'].includes(task.status)||!['assigned','pending_confirmation','active'].includes(assignment.status))throw Error('assignment locked in current workflow');
 if(!String(body.reason||'').trim())throw Error('reason required');
 let patch:Record<string,any>;
 if(action==='change_member'){
  const target=String(body.user_id||'');await activeUsers(user,[target]);await assertAssignable(user,[target]);
  const rows=await sql`SELECT org_id FROM nexusflow.users WHERE id=${target} AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;
  if(!await assignmentOrgAllowed(user,rows[0]?.org_id?String(rows[0].org_id):null,String(task.org_id),target))throw Error('forbidden: cross department resource change requires dispatch approval');
  const other=await sql`SELECT id FROM nexusflow.records WHERE kind='task_assignments' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'task_id'=${String(task.id)} AND data->>'user_id'=${target} AND id<>${String(assignment.id)} AND data->>'status' NOT IN ('cancelled','rejected') LIMIT 1`;if(other.length)throw Error('user already assigned');
  const capacityRows=await sql`SELECT data FROM nexusflow.records WHERE kind='people' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'user_id'=${target}`;
  if(!capacityRows.length)throw Error('conflict: new member capacity is unknown');
  const existing=await sql`SELECT id,data FROM nexusflow.records WHERE kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`,entries=await taskLoadEntries(user,existing.map(r=>({...r.data,id:r.id}))),trial={...assignment,id:task.id,owner_id:target,member_ids:[],status:'in_progress'},daily=calculateDailyLoads([...entries,trial],[target],String(assignment.start_date),String(assignment.end_date),Number((capacityRows[0]!.data as any).daily_standard_hours??8));
  if(daily.some(d=>d.overloaded||d.locked&&d.tasks.some(id=>id!==task.id)))throw Error('conflict: new member availability requires coordination');
  patch={user_id:target,status:task.status==='draft'?'assigned':'pending_confirmation',progress:0,member_history:[...(Array.isArray(assignment.member_history)?assignment.member_history:[]),{user_id:assignment.user_id,progress:assignment.progress,changed_at:new Date().toISOString(),reason:body.reason}]};
 }else if(action==='cancel'){if(assignment.user_id===task.owner_id)throw Error('invalid: change task owner before cancelling owner assignment');patch={status:'cancelled'};}
 else throw Error('invalid assignment action');
 await sql.begin(async tx=>{
  const current=await tx`SELECT data,updated_at FROM nexusflow.records WHERE id=${assignment.id} AND kind='task_assignments' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;if(!current[0]||new Date(current[0].updated_at).valueOf()!==new Date(assignment.updated_at).valueOf())throw Error('assignment changed; retry');
  await tx`UPDATE nexusflow.records SET data=data||${tx.json({...patch,change_reason:body.reason} as any)},updated_at=now() WHERE id=${assignment.id}`;
  const rows=await tx`SELECT data FROM nexusflow.records WHERE kind='task_assignments' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'task_id'=${String(task.id)} AND data->>'status' NOT IN ('cancelled','rejected')`,members=[...new Set(rows.map(r=>String((r.data as any).user_id)))];
  const owner=action==='change_member'&&assignment.user_id===task.owner_id?patch.user_id:task.owner_id;
  await tx`UPDATE nexusflow.records SET data=data||${tx.json({owner_id:owner,member_ids:members} as any)},updated_at=now() WHERE id=${task.id}`;
  await addAudit(tx,user,`task_assignment.${action}`,'task_assignments',String(assignment.id),{before:assignment,after:patch,reason:body.reason});
  if(action==='change_member'&&patch.user_id!==user.id)await addInbox(tx,user,patch.user_id,String(task.id),'assignment_changed','分工已调整，请确认新的安排');
 });return getRecord(user,'task_assignments',String(assignment.id));
}
