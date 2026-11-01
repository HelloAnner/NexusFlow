import { sql } from '../../db.ts';
import { getRecord,listRecords } from '../../records.ts';
import { canEditTask,type User } from '../../permissions.ts';
import { calculateDailyLoads,rangeDays,validDate } from '../../load.ts';
import { taskLoadEntries,calculateTaskConflicts } from '../load/service.ts';
import { applyForceOverrides } from '../conflicts/service.ts';
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const shiftDate=(date:string,days:number)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
export function dateRange(from=today(),to=shiftDate(from,13)){if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)throw Error('invalid planning range: maximum 367 days');return {from,to,days:rangeDays(from,to)};}
export async function calendarConfig(user:User){const rows=sql?await sql`SELECT data FROM nexusflow.records WHERE kind='config' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'status'='published' AND data->>'key'='work_calendar' ORDER BY updated_at DESC LIMIT 1`:[];const saved=rows[0]?.data as any;return {weekdays:[1,2,3,4,5],holidays:[],extra_workdays:[],...(saved?.value||{}),source:saved?'published':'default_weekdays'};}
export function isWorkday(date:string,calendar:Record<string,any>){if(calendar.extra_workdays.includes(date))return true;if(calendar.holidays.includes(date))return false;return calendar.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());}
export async function workloadData(user:User){
 const [people,visibleTasks]=await Promise.all([listRecords(user,'people'),listRecords(user,'tasks')]);
 const raw=sql?await sql`SELECT id,data FROM nexusflow.records WHERE kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`:[];
 const all=sql?raw.map(r=>({...r.data,id:r.id})):visibleTasks;
 return {people,visibleTasks,entries:await taskLoadEntries(user,all)};
}
export async function calendar(user:User,query:Record<string,string>){
 const range=dateRange(query.from,query.to),data=await workloadData(user),config=await calendarConfig(user);
 const people=query.person_id?data.people.filter(p=>p.id===query.person_id||p.user_id===query.person_id):data.people;
 if(query.person_id&&!people.length)throw Error('person not found');
 const formal=data.entries.filter(t=>!['pending_confirmation','pending_approval','pending_coordination','paused'].includes(String(t.status))),tentative=data.entries.filter(t=>['draft','pending_confirmation','pending_approval','pending_coordination'].includes(String(t.status))).map(t=>({...t,status:'in_progress'}));
 return {from:range.from,to:range.to,calendar_source:config.source,items:people.flatMap(p=>{
  const id=String(p.user_id||p.id),capacity=['leave','training','travel','unavailable','disabled'].includes(String(p.status))||p.dispatchable===false?0:Number(p.daily_standard_hours??8);
  const daily=calculateDailyLoads(formal,[id],range.from,range.to,capacity),preview=calculateDailyLoads(tentative,[id],range.from,range.to,capacity);
  return daily.map((d,index)=>{const working=isWorkday(d.date,config),effective=working?capacity:0,hours=working?d.hours:0,ids=new Set(d.tasks);return {person_id:id,name:p.name,date:d.date,hours,capacity:effective,free_hours:Math.max(0,effective-hours),overloaded:hours>effective,all_day_locked:formal.some(t=>t.all_day&&t.owner_id===id&&String(t.start_date)<=d.date&&String(t.end_date)>=d.date),tentative_hours:working?preview[index]?.hours||0:0,tasks:data.visibleTasks.filter(t=>ids.has(t.id)).map(t=>({id:t.id,name:t.name})),hidden_occupancy:d.tasks.some(task=>!data.visibleTasks.some(t=>t.id===task))};});
 })};
}
export function assignmentPlans(task:Record<string,any>,assignments:Record<string,any>[],input:Record<string,any>){
 const start=input.start_date??task.start_date,end=input.end_date??task.end_date,hours=input.daily_hours??task.daily_hours;
 if(!validDate(start)||!validDate(end)||start>end||!Number.isFinite(hours)||hours<0||hours>24)throw Error('invalid schedule dates or hours');
 const delta=(Date.parse(start)-Date.parse(task.start_date))/86400000;
 const plans=assignments.filter(a=>!['accepted','cancelled','rejected'].includes(a.status)).map(a=>({id:a.id,user_id:a.user_id,start_date:shiftDate(a.start_date,delta),end_date:a.end_date===task.end_date?end:shiftDate(a.end_date,delta),daily_hours:input.daily_hours??a.daily_hours,all_day:input.all_day??a.all_day}));
 if(plans.some(p=>p.start_date<start||p.end_date>end||p.start_date>p.end_date))throw Error('invalid schedule: assignment would fall outside task dates');
 return {task:{start_date:start,end_date:end,daily_hours:hours,all_day:input.all_day??task.all_day},assignments:plans};
}
export async function previewSchedule(user:User,id:string,input:Record<string,any>){
 const task=await getRecord(user,'tasks',id);if(!task)throw Error('task not found');if(!await canEditTask(user,task))throw Error('forbidden: task edit permission required');
 if(!['draft','in_progress','paused'].includes(task.status))throw Error('task schedule locked in current status');
 const assignments=await listRecords(user,'task_assignments'),plans=assignmentPlans(task,assignments.filter(a=>a.task_id===id),input);
 dateRange(plans.task.start_date,plans.task.end_date);
 const config=await calendarConfig(user),data=await workloadData(user),others=data.entries.filter(t=>t.id!==id&&!['draft','pending_confirmation','pending_approval','pending_coordination','paused'].includes(String(t.status)));
 const issues:Record<string,any>[]=[],people=plans.assignments.length?plans.assignments:[{...plans.task,user_id:task.owner_id}];
 for(const a of people){
  // 隐藏任务只参与容量计算，绝不泄露名称或标识。
  const rows=sql?await sql`SELECT data FROM nexusflow.records WHERE kind='people' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id} AND data->>'user_id'=${a.user_id} LIMIT 1`:[];
  const p=rows[0]?.data as any,capacity=p?Number(p.daily_standard_hours??8):null;
  if(capacity===null){issues.push({person_id:a.user_id,type:'unknown_capacity',severity:'blocking'});continue;}
  if(p.dispatchable===false||['leave','unavailable','disabled','training','travel'].includes(p.status))issues.push({person_id:a.user_id,type:'person_unavailable',severity:'blocking'});
  const trial=[...others,{...a,id,owner_id:a.user_id,member_ids:[],status:'in_progress'}],daily=calculateDailyLoads(trial,[a.user_id],a.start_date,a.end_date,capacity);
  for(const day of daily){if(!isWorkday(day.date,config))continue;const locked=others.some(t=>t.all_day&&t.owner_id===a.user_id&&String(t.start_date)<=day.date&&String(t.end_date)>=day.date);if(day.hours>capacity||locked||a.all_day&&day.tasks.some(t=>t!==id))issues.push({person_id:a.user_id,date:day.date,type:locked||a.all_day?'all_day_overlap':'workload_overload',hours:day.hours,peak_hours:day.hours,capacity,severity:locked||a.all_day?'blocking':'warning'});}
 }
 const project=task.project_id?await getRecord(user,'projects',String(task.project_id)):null;
 if(project?.end_date&&plans.task.end_date>project.end_date)issues.push({type:'project_deadline',severity:'blocking',project_deadline:project.end_date});
 const milestones=(await listRecords(user,'milestones')).filter(m=>m.task_id===id&&String(m.date||m.end_date)>plans.task.end_date);
 if(milestones.length)issues.push({type:'milestone_outside_schedule',severity:'blocking',milestone_ids:milestones.map(m=>m.id)});
 const unchanged=plans.task.start_date===task.start_date&&plans.task.end_date===task.end_date&&plans.task.daily_hours===task.daily_hours&&plans.task.all_day===Boolean(task.all_day);const live:Record<string,any>[]=issues.map(issue=>({...issue,task_id:id,status:'open'}));
 const known=unchanged?await calculateTaskConflicts(user,task):[];
 const effective=unchanged?await applyForceOverrides(user,live.map(issue=>({...issue,occupancy_fingerprint:known.find(k=>k.type===issue.type&&k.person_id===issue.person_id)?.occupancy_fingerprint}))):live;
 return {task_id:id,before:{start_date:task.start_date,end_date:task.end_date,daily_hours:task.daily_hours,all_day:Boolean(task.all_day),updated_at:task.updated_at},after:plans.task,assignments:plans.assignments,conflicts:effective,can_apply:!effective.some(i=>i.severity==='blocking'),calendar_source:config.source};
}
export function computeForecast(estimated:number|null,confirmed:number,capacity:Array<{date:string;hours:number}>,deadline:string){
 if(estimated===null)return {known:false,reason:'missing_estimated_hours',forecast_date:null};
 const remaining=Math.max(0,estimated-confirmed);if(remaining===0)return {known:true,estimated_hours:estimated,confirmed_hours:confirmed,remaining_hours:0,available_before_deadline:0,forecast_date:capacity[0]?.date??null,delay_risk:false};let left=remaining,forecast:string|null=null;
 for(const day of capacity){left-=day.hours;if(left<=0){forecast=day.date;break;}}
 return {known:forecast!==null,estimated_hours:estimated,confirmed_hours:confirmed,remaining_hours:remaining,available_before_deadline:capacity.filter(d=>d.date<=deadline).reduce((n,d)=>n+d.hours,0),forecast_date:forecast,delay_risk:remaining>capacity.filter(d=>d.date<=deadline).reduce((n,d)=>n+d.hours,0),...(forecast?{}:{reason:'insufficient_known_capacity_within_366_days'})};
}
export async function forecast(user:User,id:string){
 const task=await getRecord(user,'tasks',id);if(!task)throw Error('task not found');
 const estimated=typeof task.estimated_hours==='number'&&Number.isFinite(task.estimated_hours)&&task.estimated_hours>=0?task.estimated_hours:null;
 const logs=(await listRecords(user,'worklogs')).filter(w=>w.task_id===id),confirmed=logs.filter(w=>w.status==='confirmed').reduce((n,w)=>n+Number(w.hours||0),0);
 if(logs.some(w=>w.status!=='confirmed'))return {task_id:id,known:false,reason:'unconfirmed_worklogs',forecast_date:null};
 const assignments=(await listRecords(user,'task_assignments')).filter(a=>a.task_id===id&&!['accepted','cancelled','rejected'].includes(a.status)),config=await calendarConfig(user),data=await workloadData(user),start=task.start_date>today()?task.start_date:today(),end=shiftDate(start,365),capacities=rangeDays(start,end).map(date=>({date,hours:0}));
 const members=assignments.length?assignments:[{user_id:task.owner_id,daily_hours:task.daily_hours}];
 for(const a of members){const person=data.people.find(p=>p.user_id===a.user_id||p.id===a.user_id);if(!person)return {task_id:id,known:false,reason:'person_capacity_not_visible',forecast_date:null};const available=['active'].includes(person.status)&&person.dispatchable!==false?Number(person.daily_standard_hours??8):0,daily=calculateDailyLoads(data.entries.filter(t=>t.id!==id&&!['pending_confirmation','pending_approval','pending_coordination','paused'].includes(String(t.status))),[a.user_id],start,end,available);for(let n=0;n<capacities.length;n++)if(isWorkday(capacities[n]!.date,config))capacities[n]!.hours+=Math.min(Number(a.daily_hours||0),Math.max(0,available-daily[n]!.hours));}
 return {task_id:id,...computeForecast(estimated,confirmed,capacities,String(task.end_date)),calendar_source:config.source,assumption:'按已确认工时和当前每日投入持续推进；不是承诺完成日期'};
}
