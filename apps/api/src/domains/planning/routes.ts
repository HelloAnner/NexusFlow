import { z } from 'zod';
import type { ApiApp } from '../../shared/http.ts';
import { actor,canEditTask } from '../../permissions.ts';
import { getRecord,listRecords } from '../../records.ts';
import { sql } from '../../db.ts';
import { addAudit } from '../../shared/audit.ts';
import { addInbox } from '../inbox/service.ts';
import { calendar,dateRange,forecast,previewSchedule,today } from './service.ts';
import { prepareFiles } from './files.ts';
import { objectRequest } from '../../storage.ts';
import { allowedTaskTypes } from '../config/service.ts';
import { reconcileTaskConflicts } from '../conflicts/service.ts';
import { fileCategories,orgTypes,roles,managementLevels,professionalLevels,dutyTags,workStatuses,projectRoles } from '../../../../../packages/shared/src/index.ts';
export const scheduleInput=z.object({start_date:z.string().date().optional(),end_date:z.string().date().optional(),daily_hours:z.number().min(0).max(24).optional(),all_day:z.boolean().optional(),reason:z.string().max(2000).optional(),expected_updated_at:z.string().optional()}).strict();
export function registerPlanning(app:ApiApp){
 app.get('/api/planning/task-types',async c=>c.json({types:await allowedTaskTypes(actor(c))}));
 app.get('/api/planning/options',c=>c.json({file_categories:fileCategories,org_types:orgTypes,roles,management_levels:managementLevels,professional_levels:professionalLevels,duty_tags:dutyTags,work_statuses:workStatuses,project_roles:projectRoles}));
 app.get('/api/planning/calendar',async c=>c.json(await calendar(actor(c),c.req.query())));
 app.get('/api/planning/forecast/:id',async c=>c.json(await forecast(actor(c),c.req.param('id'))));
 app.post('/api/planning/preview/:id',async c=>c.json(await previewSchedule(actor(c),c.req.param('id'),scheduleInput.parse(await c.req.json()))));
 app.get('/api/planning/mine',async c=>{
  const u=actor(c),range=dateRange(c.req.query('from'),c.req.query('to')),[tasks,assignments,inbox]=await Promise.all([listRecords(u,'tasks'),listRecords(u,'task_assignments'),listRecords(u,'inbox')]);
  const mine=tasks.filter(t=>t.owner_id===u.id||Array.isArray(t.member_ids)&&t.member_ids.includes(u.id)),active=mine.filter(t=>!['done','archived','cancelled'].includes(t.status));
  const future=active.filter(t=>t.start_date<=range.to&&t.end_date>=range.from),overdue=active.filter(t=>t.end_date<today()),daily=await calendar(u,{from:range.from,to:range.to,person_id:u.id}).catch((e:Error)=>{if(e.message==='person not found')return {items:[],reason:'当前账号未绑定人员容量档案'};throw e;});
  return c.json({user_id:u.id,from:range.from,to:range.to,tasks:future,overdue,assignments:assignments.filter(a=>a.user_id===u.id&&a.start_date<=range.to&&a.end_date>=range.from),inbox:inbox.filter(i=>i.user_id===u.id&&i.status!=='completed'),calendar:daily,risks:{overdue_task_ids:overdue.map(t=>t.id),overloaded_days:daily.items.filter((d:any)=>d.overloaded).map((d:any)=>d.date),potential_overload_days:daily.items.filter((d:any)=>d.hours+d.tentative_hours>d.capacity).map((d:any)=>d.date)}});
 });
 app.post('/api/planning/files/:id/attach',async c=>{
  const u=actor(c),source=await getRecord(u,'files',c.req.param('id'));if(!source)return c.json({error:'file not found'},404);
  const body=z.object({task_id:z.string().optional(),project_id:z.string().optional(),category:z.string(),scope:z.enum(['personal','space']).default('space')}).strict().parse(await c.req.json());
  if(!body.task_id&&!body.project_id)return c.json({error:'task or project required'},400);
  if(Number(source.size_bytes)>25*1024*1024)return c.json({error:'file exceeds processing limit'},413);
  const bytes=await (await objectRequest('GET',String(source.object_key))).arrayBuffer(),form=new FormData();form.set('file',new File([bytes],String(source.name),{type:String(source.content_type||'application/octet-stream')}));for(const [key,value] of Object.entries(body))if(value)form.set(key,value);
  const headers=new Headers();for(const key of ['authorization','cookie','x-request-id']){const value=c.req.header(key);if(value)headers.set(key,value);}
  return app.request('http://nexusflow.internal/api/files/upload',{method:'POST',headers,body:form});
 });
 app.get('/api/planning/files/:id/text',async c=>{const value=await prepareFiles(actor(c),[c.req.param('id')]);return c.json({files:value.files,context:value.context});});
 app.post('/api/worklogs/:id/confirm',async c=>{
  const u=actor(c),log=await getRecord(u,'worklogs',c.req.param('id'));if(!log)return c.json({error:'worklog not found'},404);
  const task=await getRecord(u,'tasks',String(log.task_id));if(!task||!await canEditTask(u,task))return c.json({error:'forbidden'},403);
  if(!sql)return c.json({error:'DATABASE_URL required'},503);
  await sql.begin(async tx=>{const rows=await tx`SELECT data FROM nexusflow.records WHERE id=${log.id} AND kind='worklogs' AND tenant_id IS NOT DISTINCT FROM ${u.tenant_id} FOR UPDATE`;if(!rows[0]||(rows[0].data as any).status==='confirmed')throw Error('worklog already confirmed');const after={status:'confirmed',confirmed_by:u.id,confirmed_at:new Date().toISOString()};await tx`UPDATE nexusflow.records SET data=data||${tx.json(after as any)},updated_at=now() WHERE id=${log.id}`;await addAudit(tx,u,'worklog.confirm','worklogs',String(log.id),{before:log,after});});return c.json(await getRecord(u,'worklogs',String(log.id)));
 });
}
export async function rescheduleTask(user:ReturnType<typeof actor>,id:string,input:Record<string,any>){
 const body=scheduleInput.parse(input),preview=await previewSchedule(user,id,body);if(!preview.can_apply)throw Error('conflict: 排期调整被阻止，请先解决容量或关联约束');
 if(!sql)throw Error('DATABASE_URL required');
 await sql.begin(async tx=>{
  const rows=await tx`SELECT data,updated_at FROM nexusflow.records WHERE id=${id} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;const row=rows[0];if(!row||new Date(row.updated_at).valueOf()!==new Date(body.expected_updated_at||preview.before.updated_at).valueOf())throw Error('task changed; preview again');
  if(!await canEditTask(user,{...row.data,id}))throw Error('forbidden');
  const latest=await previewSchedule(user,id,body);if(!latest.can_apply)throw Error('conflict: schedule changed before commit');
  await tx`UPDATE nexusflow.records SET data=data||${tx.json(preview.after as any)},updated_at=now() WHERE id=${id}`;
  for(const assignment of preview.assignments){const {id:aid,...patch}=assignment;await tx`UPDATE nexusflow.records SET data=data||${tx.json(patch as any)},updated_at=now() WHERE id=${aid} AND kind='task_assignments' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`;}
  if(['start_date','end_date','daily_hours','all_day'].some(key=>(preview.before as any)[key]!==preview.after[key as keyof typeof preview.after]))await tx`UPDATE nexusflow.records SET data=data||'{"status":"open","force_invalidated":true}'::jsonb,updated_at=now() WHERE kind='conflicts' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'task_id'=${id} AND data->>'status'='forced'`;
  await reconcileTaskConflicts(tx,user,id,latest.conflicts);
  await addAudit(tx,user,'task.reschedule','tasks',id,{before:preview.before,after:preview.after,reason:body.reason||'用户调整排期'});
  const members=[...new Set(preview.assignments.map(a=>String(a.user_id)))];for(const member of members)if(member!==user.id)await addInbox(tx,user,member,id,'task_rescheduled','任务排期已调整，请查看新的安排');
 });
 return {task:await getRecord(user,'tasks',id),impact:preview};
}
export async function taskLifecycle(user:ReturnType<typeof actor>,task:Record<string,any>,action:string,body:Record<string,any>){
 if(!sql)throw Error('DATABASE_URL required');if(!await canEditTask(user,task))throw Error('forbidden');
 const transitions:Record<string,{from:string[];to:string}>={pause:{from:['in_progress'],to:'paused'},resume:{from:['paused'],to:'in_progress'},cancel:{from:['draft','pending_confirmation','pending_approval','in_progress','paused'],to:'cancelled'}};
 const transition=transitions[action];if(!transition||!transition.from.includes(task.status))throw Error('invalid task lifecycle transition');if(!String(body.reason||'').trim())throw Error('reason required');
 if(action==='resume'){const preview=await previewSchedule(user,String(task.id),{});if(!preview.can_apply)throw Error('conflict: task cannot resume until conflicts are resolved');}
 await sql.begin(async tx=>{
  const rows=await tx`SELECT data FROM nexusflow.records WHERE id=${task.id} AND kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} FOR UPDATE`;if(!rows[0]||(rows[0].data as any).status!==task.status)throw Error('task changed; retry');
  const patch={status:transition.to,change_reason:String(body.reason),changed_by:user.id,changed_at:new Date().toISOString()};await tx`UPDATE nexusflow.records SET data=data||${tx.json(patch as any)},updated_at=now() WHERE id=${task.id}`;
  if(action==='cancel'){
   await tx`UPDATE nexusflow.records SET data=data||'{"status":"cancelled"}'::jsonb,updated_at=now() WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'task_id'=${String(task.id)} AND kind IN ('task_assignments','dispatch','approvals') AND data->>'status' NOT IN ('accepted','approved','rejected','cancelled')`;
   await tx`UPDATE nexusflow.records SET data=data||'{"status":"completed","completion_reason":"task cancelled"}'::jsonb WHERE tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND kind='inbox' AND data->>'source_id'=${String(task.id)}`;
  }
  await addAudit(tx,user,`task.${action}`,'tasks',String(task.id),{before:{status:task.status},after:patch,reason:body.reason});
 });return getRecord(user,'tasks',String(task.id));
}
