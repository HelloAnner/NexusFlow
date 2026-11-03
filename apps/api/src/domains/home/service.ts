import { actor,canManage } from "../../permissions.ts";
import { sql } from "../../db.ts";
import { listRecords } from "../../records.ts";
import { calculateDailyLoads,rangeDays } from "../../load.ts";
import { taskLoadEntries } from "../load/service.ts";
import { conflicts } from "../conflicts/service.ts";
const personKey=(p:Record<string,any>)=>String(p.user_id||p.id);
// 首页与负载页共用同一份 7 天负载：全部可见成员，逐日 hours/capacity/ratio/overloaded 直接来自任务归属。
export async function home(user:ReturnType<typeof actor>){
 const tasks=await listRecords(user,"tasks"),projects=await listRecords(user,"projects"),people=await listRecords(user,"people"),inbox=await listRecords(user,"inbox"),risk=await conflicts(user);
 const visiblePeople=canManage(user)?people:people.filter(p=>p.user_id===user.id);
 const today=new Date().toISOString().slice(0,10),week=new Date(Date.now()+6*86400000).toISOString().slice(0,10),dates=rangeDays(today,week);
 const mine=tasks.filter(t=>t.owner_id===user.id||(Array.isArray(t.member_ids)&&t.member_ids.includes(user.id)));
 const focus=canManage(user)?tasks:mine;
 const raw=sql?await sql`SELECT id,data FROM nexusflow.records WHERE kind='tasks' AND tenant_id IS NOT DISTINCT FROM ${user.tenant_id}`:[];
 const all=sql?raw.map((r:any)=>({...r.data,id:r.id})):tasks;
 const capacities=Object.fromEntries(visiblePeople.map(p=>[personKey(p),["leave","travel","training","unavailable","disabled"].includes(String(p.status))?0:Number(p.daily_standard_hours??8)]));
 const loads=calculateDailyLoads(await taskLoadEntries(user,all),visiblePeople.map(personKey),today,week,capacities);
 const team_load_7d={dates,people:visiblePeople.map(p=>({person_id:personKey(p),name:p.name,daily:loads.filter(x=>x.person_id===personKey(p)).map(({tasks:_tasks,...daily})=>daily)}))};
 return Response.json({
  data_scope_applied:true,
  today_focus:focus.filter(t=>!['done','archived','cancelled'].includes(String(t.status))&&String(t.start_date)<=week&&String(t.end_date)>=today).slice(0,8),
  stats:{today_due:focus.filter(t=>t.end_date===today).length,pending_approvals:inbox.filter(i=>i.type==="approval"&&i.status==="pending").length,open_conflicts:risk.length,active_projects:projects.filter(p=>p.status==="active").length},
  timeline:focus.filter(t=>String(t.start_date)<=week&&String(t.end_date)>=today),
  risk_radar:risk,
  team_load_7d,
 });
}
