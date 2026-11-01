import type { Context,Next } from 'hono';
import type { ApiEnv } from '../../shared/http.ts';
import { sql } from '../../db.ts';
import { getRecord,collections,type Collection } from '../../records.ts';
export async function scheduleGuard(c:Context<ApiEnv>,next:Next){
 if(!sql||!['POST','PUT','PATCH','DELETE'].includes(c.req.method)||!/^\/api\/(tasks|task_assignments|dispatch|approvals|people|orgs|projects|milestones|worklogs|files|conflicts|config|invitations|visibility_grants|admin\/users)(?:\/|$)/.test(c.req.path))return next();
 // ponytail: 每租户串行资源变更；负载增长时改成按人员日期区间锁。try-lock 避免等待连接耗尽。
 const reserved=await sql.reserve(),key=`nexusflow:schedule:${c.get('user').tenant_id}`;
 try{const rows=await reserved`SELECT pg_try_advisory_lock(hashtext(${key})) AS locked`;if(!rows[0]?.locked)return c.json({error:'resource schedule changed or busy; retry after refreshing'},409);try{const version=c.req.header('if-match');if(version){const [,,kind,id]=c.req.path.split('/');if(kind&&id&&collections.includes(kind as Collection)){const current=await getRecord(c.get('user'),kind as Collection,decodeURIComponent(id));if(!current)return c.json({error:'not found'},404);if(!Number.isFinite(Date.parse(version)))return c.json({error:'invalid object version'},400);if(new Date(current.updated_at).valueOf()!==Date.parse(version))return c.json({error:'object changed; preview again'},409);}}await next();}finally{await reserved`SELECT pg_advisory_unlock(hashtext(${key}))`;}}
 finally{reserved.release();}
}
